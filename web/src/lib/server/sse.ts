// Stream SSE de lotes FIRMS firmados (contrato "Tiempo real (v2)" de CONTRACTS.md).
// No depende de Next: se puede probar con vitest pasando las dependencias a mano.
//
// CICLO: cada resultado de FIRMS (un `fetched_at` + un contenido) define un ciclo.
//   cycle_id  = `<fetched_at compacto>-<12 hex de SHA3-256(clave, origen, fetched_at, tamaño de lote, ids)>`
//   stream_id = `<stream base>:<cycle_id>`  ← va DENTRO de cada payload firmado
// Así una sesión vieja reinyectada trae un stream_id distinto del ciclo vigente y el
// Verifier (que fija el stream_id) la rechaza; además `cycle_id` empieza con la fecha en
// formato ordenable, de modo que el cliente puede descartar ciclos anteriores al último
// aceptado comparando strings. `total_batches` también se firma en cada lote.
// Los lotes se firman UNA vez por ciclo y se reutilizan entre conexiones.
import "server-only";
import type { FireDetection, SignedBatch } from "../types";
import { toBatches } from "../firms";
import { Collector, canonicalJSON, sha3hex, toBase64, type KeyPair } from "../pipeline";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
} as const;

export const MAX_BATCHES = 60;
export const DEFAULT_BATCH_SIZE = 5;
/** Únicos tamaños aceptados (acota las variantes de ciclo que se firman y cachean). */
export const BATCH_SIZES = [5, 10, 25, 50] as const;
/** Presupuesto total de una sesión (fetch + emisión), por debajo de maxDuration = 60. */
export const SESSION_BUDGET_MS = 48_000;
/** Ciclos firmados que se conservan en memoria por instancia. */
export const MAX_CACHED_CYCLES = 8;

export interface StreamFeed {
  source: string;
  origin: string;
  fetched_at: string;
  detections: FireDetection[];
  degraded?: boolean;
  note?: string;
}

export interface FirmsStreamOptions {
  /** Datos a emitir (promesa: el stream arranca ya y manda pings mientras llega FIRMS). */
  feed: Promise<StreamFeed>;
  /** Se evalúa dentro del stream; si lanza se emite `event: error`. */
  getKeyPair: () => KeyPair;
  /** Prefijo del flujo; el stream_id firmado es `${streamId}:${cycle_id}`. */
  streamId: string;
  seedOrigin?: string;
  batchSize?: number;
  signal?: AbortSignal;
  intervalMs?: number;
  pingMs?: number;
  maxBatches?: number;
  nextPollS?: number;
  budgetMs?: number;
}

/** Ajusta al tamaño permitido igual o inmediatamente superior; vacío o inválido → 5. */
export function clampBatchSize(raw: unknown): number {
  if (raw === null || raw === undefined || String(raw).trim() === "") return DEFAULT_BATCH_SIZE;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_BATCH_SIZE;
  return BATCH_SIZES.find((s) => s >= n) ?? BATCH_SIZES[BATCH_SIZES.length - 1];
}

/**
 * Tamaño efectivo de lote: el pedido, salvo que haga falta agrandarlo para que
 * TODAS las detecciones entren en `maxBatches` lotes (la sesión no supera maxDuration).
 */
export function effectiveBatchSize(total: number, requested: number, maxBatches = MAX_BATCHES): number {
  return Math.max(requested, Math.ceil(total / maxBatches), 1);
}

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Id determinista del ciclo; ordenable cronológicamente por su prefijo de fecha. */
export function cycleIdOf(feed: StreamFeed, keyId: string, batchSize: number): string {
  const t = Date.parse(feed.fetched_at);
  const stamp = Number.isFinite(t)
    ? new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
    : "00000000T000000Z";
  const digest = sha3hex(
    canonicalJSON({
      key_id: keyId,
      source: feed.source,
      origin: feed.origin,
      fetched_at: feed.fetched_at,
      batch_size: batchSize,
      ids: feed.detections.map((d) => d.id),
    }),
  );
  return `${stamp}-${digest.slice(0, 12)}`;
}

/** Un ciclo firmado: los lotes se firman a demanda, una sola vez, y quedan para otras conexiones. */
interface SignedCycle {
  cycleId: string;
  streamId: string;
  size: number;
  groups: FireDetection[][];
  collector: Collector | null; // null si el ciclo no tiene lotes
  batches: SignedBatch[];
}

const cycles = new Map<string, SignedCycle>();

function getCycle(feed: StreamFeed, kp: KeyPair, baseStreamId: string, requested: number, maxBatches: number): SignedCycle {
  const size = effectiveBatchSize(feed.detections.length, requested, maxBatches);
  const cycleId = cycleIdOf(feed, kp.keyId, size);
  const streamId = `${baseStreamId}:${cycleId}`;
  const hit = cycles.get(streamId);
  if (hit) {
    cycles.delete(streamId); // LRU: pasa al final
    cycles.set(streamId, hit);
    return hit;
  }
  const groups = toBatches(feed.detections, size);
  const cycle: SignedCycle = {
    cycleId,
    streamId,
    size,
    groups,
    collector: groups.length > 0 ? new Collector({ keyPair: kp, streamId, totalBatches: groups.length }) : null,
    batches: [],
  };
  cycles.set(streamId, cycle);
  while (cycles.size > MAX_CACHED_CYCLES) cycles.delete(cycles.keys().next().value as string);
  return cycle;
}

/** Lote `i` del ciclo; firma (en orden) solo los que todavía no firmó ninguna conexión. */
function batchAt(cycle: SignedCycle, i: number): SignedBatch {
  while (cycle.batches.length <= i) {
    cycle.batches.push(cycle.collector!.makeBatch(cycle.groups[cycle.batches.length]));
  }
  return cycle.batches[i];
}

/**
 * Eventos: hello → batch × N (cada `intervalMs`) → done; `: ping` cada `pingMs`;
 * `error` si algo falla. Se cierra tras `done`/`error` o cuando aborta el cliente.
 */
export function createFirmsStream(opts: FirmsStreamOptions): ReadableStream<Uint8Array> {
  const intervalMs = opts.intervalMs ?? 700;
  const pingMs = opts.pingMs ?? 15_000;
  const maxBatches = opts.maxBatches ?? MAX_BATCHES;
  const nextPollS = opts.nextPollS ?? 60;
  const budgetMs = opts.budgetMs ?? SESSION_BUDGET_MS;
  const requested = clampBatchSize(opts.batchSize);
  const encoder = new TextEncoder();
  const signal = opts.signal;
  const startedAt = Date.now();

  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;
  let wake: (() => void) | undefined; // despierta el sleep en curso
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

  const shutdown = () => {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    signal?.removeEventListener("abort", shutdown);
    wake?.();
    try {
      controllerRef?.close();
    } catch {
      // ya cerrado/cancelado por el cliente
    }
  };

  const send = (chunk: string) => {
    if (closed) return;
    try {
      controllerRef?.enqueue(encoder.encode(chunk));
    } catch {
      shutdown();
    }
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      if (closed) return resolve();
      const t = setTimeout(() => {
        wake = undefined;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(t);
        wake = undefined;
        resolve();
      };
    });

  async function run() {
    const feed = await opts.feed;
    if (closed) return;
    const kp = opts.getKeyPair();
    const cycle = getCycle(feed, kp, opts.streamId, requested, maxBatches);
    const total = cycle.groups.length;

    send(
      sseEvent("hello", {
        key_id: kp.keyId,
        public_key_b64: toBase64(kp.publicKey),
        stream_id: cycle.streamId,
        stream_base: opts.streamId,
        cycle_id: cycle.cycleId,
        source: feed.source,
        origin: feed.origin,
        fetched_at: feed.fetched_at,
        total_detections: feed.detections.length,
        total_batches: total,
        batch_size: cycle.size,
        ...(opts.seedOrigin ? { seed_origin: opts.seedOrigin } : {}),
        ...(feed.degraded ? { degraded: true } : {}),
        ...(feed.note ? { note: feed.note } : {}),
      }),
    );

    for (let i = 0; i < total; i++) {
      if (closed) return;
      if (i > 0) {
        // Ritmo nominal `intervalMs`; se acelera si el fetch consumió parte del presupuesto.
        const left = startedAt + budgetMs - Date.now();
        await sleep(Math.max(0, Math.min(intervalMs, left / (total - i))));
      }
      if (closed) return;
      send(sseEvent("batch", batchAt(cycle, i)));
    }
    // `batches` es informativo: el total auténtico es `payload.total_batches` (firmado).
    send(sseEvent("done", { batches: total, next_poll_s: nextPollS }));
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      if (signal?.aborted) return shutdown();
      signal?.addEventListener("abort", shutdown, { once: true });
      // `retry`: si el cliente no cierra el EventSource tras `done`, el navegador reabre recién en next_poll_s.
      send(`retry: ${nextPollS * 1000}\n: stream abierto\n\n`);
      ping = setInterval(() => send(": ping\n\n"), pingMs);
      run()
        .catch((e) => send(sseEvent("error", { message: e instanceof Error ? e.message : String(e) })))
        .finally(shutdown);
    },
    cancel() {
      shutdown();
    },
  });
}
