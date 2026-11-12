// Cliente del flujo firmado por el servidor: EventSource → Verifier en el navegador.
// Sin React (se consume con useSyncExternalStore) y con dependencias inyectables para testear.
import type { FireDetection, IntegrityStatus, SignedBatch } from "../types";
import { fromBase64 } from "../pipeline/canonical";
import { backoffMs, pollDelayMs } from "./time";
import type { CollectorInfo, StreamDone, StreamHello } from "./types";
import { createVerifier, type AsyncVerifier, type VerifierFactory } from "./verifierClient";

export type Phase = "idle" | "connecting" | "streaming" | "waiting" | "retrying" | "paused";

export interface LiveDetection {
  det: FireDetection;
  seq: number;
  /** false si el lote que la traía fue rechazado (firma inválida o clave desconocida). */
  verified: boolean;
  /** true si es una detección nueva que llegó en el último lote. */
  fresh: boolean;
}

export type LiveLogEntry =
  | {
      uid: number;
      at: number;
      kind: "batch";
      seq: number;
      status: IntegrityStatus;
      detail: string;
      verifyMs: number;
      count: number;
      hash: string;
    }
  | { uid: number; at: number; kind: "info" | "warn" | "error"; text: string };

export interface LiveStats {
  /** Lotes aceptados sin observaciones (acumulado de la sesión). */
  batchesOk: number;
  /** Lotes rechazados o con anomalías de secuencia (acumulado de la sesión). */
  batchesFailed: number;
  lastVerifyMs: number;
  avgVerifyMs: number;
  cycles: number;
}

export interface LiveSnapshot {
  phase: Phase;
  hello: StreamHello | null;
  collector: CollectorInfo | null;
  detections: LiveDetection[];
  log: LiveLogEntry[];
  stats: LiveStats;
  /** Progreso del ciclo actual. */
  cycleReceived: number;
  cycleTotal: number;
  /** Momento (ms epoch) de la próxima reconexión, si hay una programada. */
  nextPollAt: number | null;
  /** Duración total de la espera en curso (para dibujar el progreso). */
  waitMs: number;
  lastDoneAt: number | null;
  error: string | null;
  attempt: number;
  /** Último ciclo completo tal como lo firmó el servidor (lo reusa el sandbox de ataques). */
  lastBatches: SignedBatch[];
  /** Mensaje corto para lectores de pantalla (aria-live). */
  announce: string;
  /** Rotación de la clave del recolector detectada en esta sesión (se muestra como advertencia). */
  keyChange: { from: string; to: string; at: number } | null;
  /** Dónde corre la verificación ML-DSA: Web Worker o hilo principal. */
  verifyMode: "worker" | "main" | null;
}

/** Subconjunto de EventSource que usa el store. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (e: { data?: unknown }) => void): void;
  close(): void;
}

export interface StreamDeps {
  createEventSource: (url: string) => EventSourceLike;
  fetchJson: (url: string) => Promise<unknown>;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  createVerifier: VerifierFactory;
}

const defaultDeps = (): StreamDeps => ({
  createVerifier,
  createEventSource: (url) => new EventSource(url) as unknown as EventSourceLike,
  fetchJson: async (url) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.json();
  },
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
});

const LOG_CAP = 80;
/** Sin eventos durante este tiempo, el flujo se considera colgado. */
export const WATCHDOG_MS = 45000;

/**
 * Estados en los que las detecciones del lote se aceptan: firma válida y lote ubicado en la cadena.
 * `broken_chain` queda afuera: la firma es válida pero el lote no pertenece a esta cadena
 * (bifurcación u otro flujo), así que sus focos no se dibujan como verificados.
 */
export const ACCEPTED: ReadonlySet<IntegrityStatus> = new Set(["ok", "gap", "reordered"]);

/**
 * El stream_id de un ciclo debe derivar del prefijo publicado en /api/collector: `base:cycle_id`
 * (exacto si el `hello` trae cycle_id). Sin cycle_id se acepta también el prefijo solo.
 */
export function streamIdAllowed(helloId: string, collectorId: string | undefined, cycleId?: string): boolean {
  if (!collectorId) return true;
  if (cycleId) return helloId === `${collectorId}:${cycleId}`;
  return helloId === collectorId || helloId.startsWith(`${collectorId}:`);
}

function isCollector(x: unknown): x is CollectorInfo {
  const c = x as CollectorInfo | null;
  return !!c && typeof c.key_id === "string" && typeof c.public_key_b64 === "string" && c.public_key_b64.length > 0;
}

function isBatch(x: unknown): x is SignedBatch {
  const b = x as SignedBatch | null;
  return (
    !!b &&
    typeof b.payload_hash === "string" &&
    typeof b.signature === "string" &&
    !!b.payload &&
    typeof b.payload.seq === "number" &&
    typeof b.payload.key_id === "string" &&
    Array.isArray(b.payload.detections)
  );
}

export class LiveStreamStore {
  private deps: StreamDeps;
  private listeners = new Set<() => void>();
  private batchSize: number;

  private active = false;
  private visible = true;
  private token = 0;
  private es: EventSourceLike | null = null;
  private timer: unknown = null;
  private watchdog: unknown = null;

  private phase: Phase = "idle";
  private hello: StreamHello | null = null;
  private collector: CollectorInfo | null = null;
  private publicKey: Uint8Array | null = null;
  private verifier: AsyncVerifier | null = null;
  private keyChange: LiveSnapshot["keyChange"] = null;
  /** Último cycle_id del que se aceptó al menos un lote. */
  private lastCycleId: string | null = null;
  private cycleOkStart = 0;
  private detsCache: LiveDetection[] = [];
  private detsDirty = false;
  private dets = new Map<string, LiveDetection>();
  private cycleIds = new Set<string>();
  private cycleRejected = new Set<string>();
  private verifyMode: LiveSnapshot["verifyMode"] = null;
  private cycleBatches: SignedBatch[] = [];
  private cycleClean = true;
  private lastBatches: SignedBatch[] = [];
  private log: LiveLogEntry[] = [];
  private uid = 0;
  private ok = 0;
  private failed = 0;
  private verifyTotal = 0;
  private verifyCount = 0;
  private lastVerifyMs = 0;
  private cycles = 0;
  private cycleReceived = 0;
  private nextPollAt: number | null = null;
  private waitMs = 0;
  private lastDoneAt: number | null = null;
  private error: string | null = null;
  private attempt = 0;
  private announce = "";
  private snap: LiveSnapshot;

  constructor(opts: { batchSize?: number; deps?: Partial<StreamDeps> } = {}) {
    this.deps = { ...defaultDeps(), ...opts.deps };
    this.batchSize = opts.batchSize ?? 5;
    this.snap = this.build();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  /** Clave pública de confianza (la de /api/collector), para reusar los lotes en el sandbox. */
  get trustedPublicKey() {
    return this.publicKey;
  }

  start() {
    if (this.active) return;
    this.active = true;
    if (this.visible) this.connect();
    else this.setPhase("paused");
  }

  stop() {
    this.active = false;
    this.teardown();
    this.nextPollAt = null;
    this.phase = "idle";
    this.emit();
  }

  /** Pausa el flujo con la pestaña oculta; al volver reconecta si ya tocaba (o si quedó a medias). */
  setVisible(visible: boolean) {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!this.active) return;
    if (!visible) {
      const midCycle = this.phase === "connecting" || this.phase === "streaming";
      this.teardown();
      if (midCycle) this.nextPollAt = null;
      this.setPhase("paused");
      return;
    }
    const remaining = this.nextPollAt === null ? 0 : this.nextPollAt - this.deps.now();
    if (remaining > 0) {
      this.phase = this.error ? "retrying" : "waiting";
      this.schedule(remaining, false);
      this.emit();
    } else {
      this.connect();
    }
  }

  /** Consulta manual inmediata. */
  refresh() {
    if (!this.active || !this.visible) return;
    this.attempt = 0;
    this.connect();
  }

  // ───────── ciclo ─────────

  private teardown() {
    this.token += 1;
    this.es?.close();
    this.es = null;
    this.verifier?.dispose();
    this.verifier = null;
    if (this.timer !== null) this.deps.clearTimeout(this.timer);
    if (this.watchdog !== null) this.deps.clearTimeout(this.watchdog);
    this.timer = null;
    this.watchdog = null;
  }

  private schedule(ms: number, resetWait = true) {
    if (this.timer !== null) this.deps.clearTimeout(this.timer);
    this.nextPollAt = this.deps.now() + ms;
    if (resetWait) this.waitMs = ms;
    this.timer = this.deps.setTimeout(() => {
      this.timer = null;
      if (this.active && this.visible) this.connect();
    }, ms);
  }

  private armWatchdog(token: number) {
    if (this.watchdog !== null) this.deps.clearTimeout(this.watchdog);
    this.watchdog = this.deps.setTimeout(() => {
      this.watchdog = null;
      if (token === this.token) this.fail("El flujo dejó de enviar eventos.");
    }, WATCHDOG_MS);
  }

  private async loadCollector(): Promise<void> {
    const info = await this.deps.fetchJson("/api/collector");
    if (!isCollector(info)) throw new Error("Respuesta inesperada de /api/collector.");
    this.collector = info;
    this.publicKey = fromBase64(info.public_key_b64);
  }

  private async connect() {
    this.teardown();
    const token = this.token;
    this.phase = "connecting";
    this.nextPollAt = null;
    this.cycleReceived = 0;
    this.cycleIds = new Set();
    this.cycleRejected = new Set();
    this.cycleBatches = [];
    this.cycleClean = true;
    this.cycleOkStart = this.ok;
    this.emit();

    // Ancla de confianza: la clave pública se pide por un canal aparte del flujo.
    try {
      if (!this.publicKey) await this.loadCollector();
    } catch (e) {
      if (token === this.token) this.fail(e instanceof Error ? e.message : "No se pudo obtener la clave pública del recolector.");
      return;
    }
    if (token !== this.token) return;

    let es: EventSourceLike;
    try {
      es = this.deps.createEventSource(`/api/stream?batch=${this.batchSize}`);
    } catch {
      this.fail("Este navegador no pudo abrir el flujo (EventSource).");
      return;
    }
    this.es = es;
    this.armWatchdog(token);

    // Los eventos se procesan en serie: `hello` puede tener que volver a pedir la clave.
    let chain: Promise<void> = Promise.resolve();
    const on = (type: string, handler: (data: unknown) => void | Promise<void>) => {
      es.addEventListener(type, (e) => {
        if (token !== this.token) return;
        this.armWatchdog(token);
        chain = chain.then(async () => {
          if (token !== this.token) return;
          let data: unknown;
          try {
            data = typeof e.data === "string" ? JSON.parse(e.data) : undefined;
          } catch {
            this.fail(`Evento "${type}" ilegible.`);
            return;
          }
          await handler(data);
        });
      });
    };

    on("hello", (d) => this.onHello(d as StreamHello, token));
    on("batch", (d) => this.onBatch(d, token));
    on("done", (d) => this.onDone(d as StreamDone, token));
    // "error" llega tanto por un `event: error` del servidor (con data) como por un corte de red (sin data).
    es.addEventListener("error", (e) => {
      if (token !== this.token) return;
      let msg = "Se cortó la conexión con /api/stream.";
      // Se cierra ya mismo para que el navegador no reconecte por su cuenta: los reintentos los maneja el store.
      es.close();
      if (typeof e.data === "string") {
        try {
          const m = (JSON.parse(e.data) as { message?: unknown }).message;
          if (typeof m === "string" && m) msg = `El servidor informó un error: ${m}`;
        } catch {
          /* se conserva el mensaje genérico */
        }
      }
      chain = chain.then(() => {
        if (token === this.token) this.fail(msg);
      });
    });
  }

  private async onHello(h: StreamHello, token: number) {
    if (!h || typeof h.key_id !== "string" || typeof h.stream_id !== "string") {
      this.fail('Evento "hello" inesperado.');
      return;
    }
    if (this.verifier) {
      // Un segundo `hello` en la misma conexión no reinicia el verificador (borraría el estado de la cadena).
      this.cycleClean = false;
      this.pushLog({ kind: "warn", text: "Llegó un segundo «hello» en la misma conexión: se ignora." });
      this.emit();
      return;
    }
    // cycle_id es ordenable (empieza con la fecha del dato): un ciclo anterior al último aceptado es un replay.
    if (typeof h.cycle_id === "string" && this.lastCycleId !== null && h.cycle_id < this.lastCycleId) {
      this.fail(`El servidor ofreció un ciclo más viejo (${h.cycle_id.slice(0, 32)}) que el último aceptado: se descarta.`);
      return;
    }
    this.hello = h;
    this.phase = "streaming";
    this.error = null;
    if (this.collector && h.key_id !== this.collector.key_id) {
      // El servidor pudo rotar la clave: se vuelve a pedir el ancla, nunca se confía en la clave del propio flujo.
      const before = this.collector.key_id;
      try {
        await this.loadCollector();
        if (token !== this.token) return;
      } catch {
        /* se sigue con la clave anterior; los lotes fallarán como clave desconocida */
      }
      if (this.collector.key_id !== before) {
        this.keyChange = { from: before, to: this.collector.key_id, at: this.deps.now() };
        this.cycleClean = false;
        this.pushLog({
          kind: "warn",
          text: `La clave publicada en /api/collector cambió de ${before.slice(0, 8)}… a ${this.collector.key_id.slice(0, 8)}…. Se adopta porque esa ruta es el ancla de confianza; si no esperabas una rotación, no confíes en estos datos.`,
        });
      }
      if (this.collector.key_id !== h.key_id) {
        this.pushLog({
          kind: "warn",
          text: `El flujo anuncia la clave ${h.key_id.slice(0, 8)}… pero /api/collector publica ${this.collector.key_id.slice(0, 8)}…: los lotes no se aceptarán.`,
        });
      }
    }
    // Cada sesión SSE es una cadena nueva (seq 0) con su propio stream_id: el verificador queda fijado a él.
    let pin = h.stream_id;
    if (!streamIdAllowed(h.stream_id, this.collector?.stream_id, typeof h.cycle_id === "string" ? h.cycle_id : undefined)) {
      pin = this.collector!.stream_id;
      this.pushLog({
        kind: "warn",
        text: `El flujo anuncia el stream "${h.stream_id.slice(0, 40)}", que no deriva del publicado en /api/collector ("${pin}"): los lotes no se aceptarán.`,
      });
    }
    this.verifier = this.deps.createVerifier(this.publicKey!, pin);
    this.emit();
  }

  private async onBatch(data: unknown, token: number) {
    if (!isBatch(data) || !this.verifier) {
      this.failed += 1;
      this.cycleClean = false;
      this.cycleReceived += 1;
      this.pushLog({
        kind: "error",
        text: this.verifier ? "Llegó un lote con formato inválido: se descarta." : "Llegó un lote antes del «hello»: se descarta.",
      });
      this.emit();
      return;
    }
    const res = await this.verifier.ingest(data);
    if (token !== this.token) return;
    this.cycleReceived += 1;
    this.cycleBatches.push(data);
    this.lastVerifyMs = res.verify_ms;
    this.verifyTotal += res.verify_ms;
    this.verifyCount += 1;
    if (res.status === "ok") this.ok += 1;
    else {
      this.failed += 1;
      this.cycleClean = false;
    }

    for (const [id, d] of this.dets) {
      if (d.fresh) {
        this.dets.set(id, { ...d, fresh: false });
        this.detsDirty = true;
      }
    }
    if (res.status !== "duplicate") {
      const verified = ACCEPTED.has(res.status);
      for (const det of data.payload.detections) {
        if (!det || typeof det.id !== "string") continue;
        const prev = this.dets.get(det.id);
        // Un lote rechazado nunca pisa una detección que ya estaba verificada.
        if (!verified && prev?.verified) continue;
        if (verified) this.cycleIds.add(det.id);
        else this.cycleRejected.add(det.id);
        this.dets.set(det.id, { det, seq: data.payload.seq, verified, fresh: !prev });
        this.detsDirty = true;
      }
    }
    this.pushLog({
      kind: "batch",
      seq: res.seq,
      status: res.status,
      detail: res.detail,
      verifyMs: res.verify_ms,
      count: data.payload.detections.length,
      hash: data.payload_hash,
    });
    this.emit();
  }

  private async onDone(d: StreamDone, token: number) {
    // El total firmado dentro de los lotes manda; `done.batches` y `hello.total_batches` viajan sin firmar
    // y sólo sirven de respaldo (quien corta el final del flujo también podría alterarlos).
    // De los dos, se prefiere el total de sesión del `hello`: `done.batches` cuenta envíos, no seq.
    const announced = this.hello?.total_batches;
    const unsigned = typeof announced === "number" ? announced : typeof d?.batches === "number" ? d.batches : undefined;
    const info = this.verifier ? await this.verifier.finalize(unsigned) : { lost: [], expected: 0, declaredTotal: null };
    if (token !== this.token) return;
    if (info.lost.length > 0) {
      this.cycleClean = false;
      // Los huecos intermedios ya se contaron al detectarse (estado "gap"); acá sólo se suma el corte final.
      this.failed += info.lost.filter((s) => s >= info.expected).length;
      const total = info.declaredTotal ?? unsigned;
      const shown = info.lost.length > 8 ? `#${info.lost.slice(0, 8).join(", #")}…` : `#${info.lost.join(", #")}`;
      this.pushLog({
        kind: "warn",
        text: `La sesión declaraba ${total} lotes${info.declaredTotal === null ? " (total sin firmar)" : " (total firmado)"} y nunca llegaron ${info.lost.length}: ${shown}.`,
      });
    }
    // Lo que el servidor ya no informa en este ciclo sale del mapa.
    for (const id of [...this.dets.keys()]) {
      if (!this.cycleIds.has(id) && !this.cycleRejected.has(id)) this.dets.delete(id);
    }
    for (const [id, det] of this.dets) if (det.fresh) this.dets.set(id, { ...det, fresh: false });
    this.detsDirty = true;

    this.lastBatches = this.cycleBatches;
    if (typeof this.hello?.cycle_id === "string" && this.ok > this.cycleOkStart) this.lastCycleId = this.hello.cycle_id;
    this.cycles += 1;
    this.attempt = 0;
    this.error = null;
    this.lastDoneAt = this.deps.now();
    const n = this.cycleReceived;
    this.announce = this.cycleClean
      ? n === 0
        ? "Ciclo completo: el servidor no informó focos."
        : `Ciclo completo: ${n} ${n === 1 ? "lote verificado" : "lotes verificados"} en tu navegador, sin fallos.`
      : `Ciclo completo con observaciones: revisá el registro de verificación.`;
    this.pushLog({ kind: "info", text: this.announce });

    this.verifyMode = this.verifier?.mode ?? this.verifyMode;
    this.teardown();
    this.phase = "waiting";
    this.schedule(pollDelayMs(d?.next_poll_s));
    this.emit();
  }

  private fail(message: string) {
    this.teardown();
    const delay = backoffMs(this.attempt);
    this.attempt += 1;
    this.error = message;
    this.announce = `${message} Reintento automático en ${Math.round(delay / 1000)} segundos.`;
    this.pushLog({ kind: "error", text: message });
    this.phase = "retrying";
    if (this.active && this.visible) this.schedule(delay);
    this.emit();
  }

  // ───────── estado ─────────

  private setPhase(p: Phase) {
    this.phase = p;
    this.emit();
  }

  private pushLog(entry: Omit<Extract<LiveLogEntry, { kind: "batch" }>, "uid" | "at"> | { kind: "info" | "warn" | "error"; text: string }) {
    this.log = [{ ...entry, uid: ++this.uid, at: this.deps.now() } as LiveLogEntry, ...this.log].slice(0, LOG_CAP);
  }

  private build(): LiveSnapshot {
    // El arreglo de detecciones sólo se rehace si cambió (evita un setData completo del mapa por cada emit).
    if (this.detsDirty) {
      this.detsCache = [...this.dets.values()];
      this.detsDirty = false;
    }
    return {
      phase: this.phase,
      hello: this.hello,
      collector: this.collector,
      detections: this.detsCache,
      log: this.log,
      stats: {
        batchesOk: this.ok,
        batchesFailed: this.failed,
        lastVerifyMs: this.lastVerifyMs,
        avgVerifyMs: this.verifyCount ? this.verifyTotal / this.verifyCount : 0,
        cycles: this.cycles,
      },
      cycleReceived: this.cycleReceived,
      cycleTotal: this.hello?.total_batches ?? 0,
      nextPollAt: this.nextPollAt,
      waitMs: this.waitMs,
      lastDoneAt: this.lastDoneAt,
      error: this.error,
      attempt: this.attempt,
      lastBatches: this.lastBatches,
      announce: this.announce,
      keyChange: this.keyChange,
      verifyMode: this.verifier?.mode ?? this.verifyMode,
    };
  }

  private emit() {
    this.snap = this.build();
    for (const fn of this.listeners) fn();
  }
}
