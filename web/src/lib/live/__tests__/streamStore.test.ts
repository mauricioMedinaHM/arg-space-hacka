import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Collector, applyAttack, generateKeyPair, toBase64 } from "../../pipeline";
import { loadHistorical } from "../../firms-historical";
import { DemoEngine } from "../../demo/engine";
import type { SignedBatch } from "../../types";
import { LiveStreamStore, WATCHDOG_MS, type EventSourceLike } from "../streamStore";
import { PollStore } from "../pollStore";

const kp = generateKeyPair(new Uint8Array(32).fill(7));
const other = generateKeyPair(new Uint8Array(32).fill(8));
const dets = loadHistorical().slice(0, 15);
const collectorInfo = (k = kp) => ({ alg: "ML-DSA-65", key_id: k.keyId, public_key_b64: toBase64(k.publicKey), stream_id: "salta-firms-viirs", seed_origin: "qrng-demo" });
const sign = (k = kp, from = dets, opts: { streamId?: string; total?: boolean } = {}): SignedBatch[] => {
  const groups = [from.slice(0, 5), from.slice(5, 10), from.slice(10, 15)].filter((b) => b.length);
  const c = new Collector({ keyPair: k, streamId: opts.streamId, ...(opts.total ? { totalBatches: groups.length } : {}) });
  return groups.map((b) => c.makeBatch(b));
};
const hello = (k = kp, extra = {}) => ({
  key_id: k.keyId,
  public_key_b64: toBase64(k.publicKey),
  stream_id: "salta-firms-viirs",
  source: "firms-live",
  origin: "firms-public-24h",
  fetched_at: new Date(0).toISOString(),
  total_detections: 15,
  total_batches: 3,
  ...extra,
});

class FakeES implements EventSourceLike {
  static all: FakeES[] = [];
  closed = false;
  private handlers = new Map<string, ((e: { data?: unknown }) => void)[]>();
  constructor(public url: string) {
    FakeES.all.push(this);
  }
  addEventListener(type: string, fn: (e: { data?: unknown }) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  send(type: string, data?: unknown) {
    for (const fn of this.handlers.get(type) ?? []) fn(data === undefined ? {} : { data: JSON.stringify(data) });
  }
  raw(type: string, data: string) {
    for (const fn of this.handlers.get(type) ?? []) fn({ data });
  }
}

const flush = async () => {
  for (let i = 0; i < 80; i++) await Promise.resolve();
};

function setup(fetchJson = vi.fn<(url: string) => Promise<unknown>>(async () => collectorInfo())) {
  const store = new LiveStreamStore({
    deps: { createEventSource: (url) => new FakeES(url), fetchJson, now: () => Date.now() },
  });
  return { store, fetchJson, last: () => FakeES.all[FakeES.all.length - 1] };
}

async function runCycle(es: FakeES, batches: SignedBatch[], next_poll_s = 60, h = hello()) {
  es.send("hello", h);
  for (const b of batches) es.send("batch", b);
  es.send("done", { batches: batches.length, next_poll_s });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T18:00:00Z"));
  FakeES.all = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("LiveStreamStore", () => {
  it("verifica en el cliente los lotes firmados por el servidor y programa el próximo sondeo", async () => {
    const { store, fetchJson, last } = setup();
    store.start();
    expect(store.getSnapshot().phase).toBe("connecting");
    await flush();
    expect(fetchJson).toHaveBeenCalledWith("/api/collector");
    expect(last().url).toBe("/api/stream?batch=5");

    const batches = sign();
    await runCycle(last(), batches);
    const s = store.getSnapshot();
    expect(s.phase).toBe("waiting");
    expect(s.stats).toMatchObject({ batchesOk: 3, batchesFailed: 0, cycles: 1 });
    expect(s.detections).toHaveLength(15);
    expect(s.detections.every((d) => d.verified && !d.fresh)).toBe(true);
    expect(s.lastBatches).toHaveLength(3);
    expect(s.nextPollAt).toBe(Date.now() + 60_000);
    expect(s.announce).toMatch(/3 lotes verificados/);
    expect(last().closed).toBe(true);
  });

  it("reabre tras next_poll_s con una cadena nueva (seq 0) sin marcar duplicados, y poda lo que ya no llega", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    await runCycle(last(), sign());
    expect(FakeES.all).toHaveLength(1);
    vi.advanceTimersByTime(59_999);
    expect(FakeES.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await flush();
    expect(FakeES.all).toHaveLength(2);

    const es = last();
    es.send("hello", hello(kp, { total_detections: 5, total_batches: 1 }));
    es.send("batch", sign(kp, dets.slice(0, 5))[0]);
    await flush();
    // a mitad de ciclo el mapa conserva el ciclo anterior, sin novedades "frescas"
    expect(store.getSnapshot().detections).toHaveLength(15);
    expect(store.getSnapshot().detections.some((d) => d.fresh)).toBe(false);
    es.send("done", { batches: 1, next_poll_s: 60 });
    await flush();
    const s = store.getSnapshot();
    expect(s.detections).toHaveLength(5);
    expect(s.stats).toMatchObject({ batchesOk: 4, batchesFailed: 0, cycles: 2 });
  });

  it("rechaza lotes alterados y los firmados con otra clave", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    const good = sign();
    const tampered = applyAttack(good, "tamper", 1);
    last().send("hello", hello());
    last().send("batch", tampered[0]);
    last().send("batch", tampered[1]);
    last().send("batch", sign(other)[2]);
    last().send("done", { batches: 3, next_poll_s: 60 });
    await flush();
    const s = store.getSnapshot();
    const statuses = s.log.flatMap((e) => (e.kind === "batch" ? [e.status] : [])).reverse();
    expect(statuses).toEqual(["ok", "tampered", "unknown_key"]);
    expect(s.stats.batchesOk).toBe(1);
    expect(s.stats.batchesFailed).toBeGreaterThanOrEqual(2);
    expect(s.detections.filter((d) => d.verified)).toHaveLength(5);
    expect(s.detections.filter((d) => !d.verified).length).toBeGreaterThan(0);
    expect(s.announce).toMatch(/observaciones/);
  });

  it("no confía en la clave que anuncia el propio flujo", async () => {
    const { store, fetchJson, last } = setup();
    store.start();
    await flush();
    await runCycle(last(), sign(other), 60, hello(other));
    const s = store.getSnapshot();
    expect(fetchJson).toHaveBeenCalledTimes(2); // re-pidió el ancla por si hubo rotación
    expect(s.stats.batchesOk).toBe(0);
    expect(s.detections.every((d) => !d.verified)).toBe(true);
    expect(s.log.some((e) => e.kind === "warn")).toBe(true);
  });

  it("acepta una rotación de clave publicada en /api/collector", async () => {
    const fetchJson = vi.fn<(url: string) => Promise<unknown>>().mockResolvedValueOnce(collectorInfo()).mockResolvedValue(collectorInfo(other));
    const { store, last } = setup(fetchJson);
    store.start();
    await flush();
    await runCycle(last(), sign(other), 60, hello(other));
    expect(store.getSnapshot().stats).toMatchObject({ batchesOk: 3, batchesFailed: 0 });
    expect(store.getSnapshot().collector?.key_id).toBe(other.keyId);
    // …pero nunca en silencio: queda la advertencia visible
    expect(store.getSnapshot().keyChange).toMatchObject({ from: kp.keyId, to: other.keyId });
    expect(store.getSnapshot().log.some((e) => e.kind === "warn" && /cambió/.test(e.text))).toBe(true);
    expect(store.getSnapshot().announce).toMatch(/observaciones/);
  });

  it("detecta lotes que el servidor anunció y no llegaron", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    const b = sign();
    last().send("hello", hello());
    last().send("batch", b[0]);
    last().send("batch", b[2]);
    last().send("done", { batches: 3, next_poll_s: 60 });
    await flush();
    const s = store.getSnapshot();
    expect(s.stats.batchesFailed).toBeGreaterThan(0);
    expect(s.log.some((e) => e.kind === "warn" && /nunca llegaron 1: #1/.test(e.text))).toBe(true);
    // el hueco intermedio se cuenta una sola vez (al detectarse), no de nuevo al cerrar
    expect(s.stats).toMatchObject({ batchesOk: 1, batchesFailed: 1 });
  });

  it("detecta el corte del final con el total FIRMADO aunque `done` mienta", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    const b = sign(kp, dets, { total: true });
    last().send("hello", hello());
    last().send("batch", b[0]);
    last().send("batch", b[1]);
    last().send("done", { batches: 2, next_poll_s: 60 }); // un intermediario recortó el último lote y ajustó el contador
    await flush();
    const s = store.getSnapshot();
    expect(s.stats).toMatchObject({ batchesOk: 2, batchesFailed: 1 });
    expect(s.log.some((e) => e.kind === "warn" && /total firmado/.test(e.text) && /#2/.test(e.text))).toBe(true);
    expect(s.announce).toMatch(/observaciones/);
  });

  it("fija el stream_id del ciclo: un lote auténtico de otro flujo no se acepta ni se dibuja como verificado", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    const cycle = "salta-firms-viirs:20261112T180000-abc";
    const mine = sign(kp, dets, { streamId: cycle });
    const old = sign(kp, dets, { streamId: "salta-firms-viirs:20261101T000000-old" });
    last().send("hello", hello(kp, { stream_id: cycle, cycle_id: "20261112T180000-abc" }));
    last().send("batch", mine[0]);
    last().send("batch", old[1]); // replay de una sesión vieja, firma válida
    last().send("batch", mine[1]);
    last().send("batch", mine[2]);
    last().send("done", { batches: 4, next_poll_s: 60 });
    await flush();
    const s = store.getSnapshot();
    const statuses = s.log.flatMap((e) => (e.kind === "batch" ? [e.status] : [])).reverse();
    expect(statuses).toEqual(["ok", "broken_chain", "ok", "ok"]);
    expect(s.stats).toMatchObject({ batchesOk: 3, batchesFailed: 1 });
    expect(s.detections).toHaveLength(15);
    expect(s.detections.every((d) => d.verified)).toBe(true); // el replay no pisa lo verificado
    expect(s.hello?.cycle_id).toBe("20261112T180000-abc");
  });

  it("exige stream_id = prefijo:cycle_id y descarta un ciclo más viejo que el último aceptado", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    const mk = (id: string) => ({ sid: `salta-firms-viirs:${id}`, id });
    const b = mk("20261112T180000Z-bbb");
    await runCycle(last(), sign(kp, dets, { streamId: b.sid, total: true }), 60, hello(kp, { stream_id: b.sid, cycle_id: b.id }));
    expect(store.getSnapshot().stats).toMatchObject({ batchesOk: 3, batchesFailed: 0 });

    vi.advanceTimersByTime(60_000);
    await flush();
    const a = mk("20261112T170000Z-aaa"); // replay de un ciclo anterior completo y bien firmado
    await runCycle(last(), sign(kp, dets, { streamId: a.sid, total: true }), 60, hello(kp, { stream_id: a.sid, cycle_id: a.id }));
    let s = store.getSnapshot();
    expect(s.phase).toBe("retrying");
    expect(s.error).toMatch(/ciclo más viejo/);
    expect(s.stats.batchesOk).toBe(3);

    vi.advanceTimersByTime(2000);
    await flush();
    // cycle_id que no corresponde al stream_id anunciado
    await runCycle(last(), sign(kp, dets, { streamId: b.sid, total: true }), 60, hello(kp, { stream_id: b.sid, cycle_id: "20261112T190000Z-ccc" }));
    s = store.getSnapshot();
    expect(s.stats.batchesOk).toBe(3);
    expect(s.log.some((e) => e.kind === "warn" && /no deriva/.test(e.text))).toBe(true);
  });

  it("rechaza un stream_id que no deriva del publicado en /api/collector", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    await runCycle(last(), sign(kp, dets, { streamId: "otro-flujo" }), 60, hello(kp, { stream_id: "otro-flujo" }));
    const s = store.getSnapshot();
    expect(s.stats.batchesOk).toBe(0);
    expect(s.detections.some((d) => d.verified)).toBe(false);
    expect(s.log.some((e) => e.kind === "warn" && /no deriva/.test(e.text))).toBe(true);
  });

  it("ignora un segundo hello en la misma conexión (no reinicia la cadena)", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    const b = sign();
    last().send("hello", hello());
    last().send("batch", b[0]);
    last().send("hello", hello());
    last().send("batch", b[0]); // con un verificador nuevo pasaría como válido
    last().send("batch", b[1]);
    last().send("batch", b[2]);
    last().send("done", { batches: 4, next_poll_s: 60 });
    await flush();
    const statuses = store.getSnapshot().log.flatMap((e) => (e.kind === "batch" ? [e.status] : [])).reverse();
    expect(statuses).toEqual(["ok", "duplicate", "ok", "ok"]);
  });

  it("reintenta con espera exponencial ante cortes y errores del servidor", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    last().send("error");
    await flush();
    let s = store.getSnapshot();
    expect(s.phase).toBe("retrying");
    expect(s.attempt).toBe(1);
    expect(s.nextPollAt).toBe(Date.now() + 2000);
    expect(last().closed).toBe(true);

    vi.advanceTimersByTime(2000);
    await flush();
    expect(FakeES.all).toHaveLength(2);
    last().send("error", { message: "FIRMS caído" });
    await flush();
    s = store.getSnapshot();
    expect(s.error).toMatch(/FIRMS caído/);
    expect(s.nextPollAt).toBe(Date.now() + 4000);

    vi.advanceTimersByTime(4000);
    await flush();
    await runCycle(last(), sign());
    s = store.getSnapshot();
    expect(s).toMatchObject({ phase: "waiting", attempt: 0, error: null });
  });

  it("falla con /api/collector degradado o caído y con eventos ilegibles", async () => {
    const fetchJson = vi
      .fn<(url: string) => Promise<unknown>>()
      .mockResolvedValueOnce({ key_id: "", public_key_b64: "", degraded: true })
      .mockRejectedValueOnce(new Error("HTTP 503 en /api/collector"))
      .mockResolvedValue(collectorInfo());
    const { store, last } = setup(fetchJson);
    store.start();
    await flush();
    expect(store.getSnapshot().phase).toBe("retrying");
    expect(FakeES.all).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    await flush();
    expect(store.getSnapshot().error).toMatch(/503/);
    vi.advanceTimersByTime(4000);
    await flush();
    expect(FakeES.all).toHaveLength(1);
    last().raw("hello", "{no es json");
    await flush();
    expect(store.getSnapshot().phase).toBe("retrying");
  });

  it("el watchdog corta un flujo colgado", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    last().send("hello", hello());
    await flush();
    vi.advanceTimersByTime(WATCHDOG_MS - 1);
    expect(store.getSnapshot().phase).toBe("streaming");
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot().phase).toBe("retrying");
    expect(last().closed).toBe(true);
  });

  it("se pausa con la pestaña oculta y retoma según corresponda", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    await runCycle(last(), sign());

    // oculta durante la espera: no reconecta hasta volver
    store.setVisible(false);
    expect(store.getSnapshot().phase).toBe("paused");
    vi.advanceTimersByTime(120_000);
    await flush();
    expect(FakeES.all).toHaveLength(1);
    store.setVisible(true); // ya venció el sondeo → reconecta ya
    await flush();
    expect(FakeES.all).toHaveLength(2);

    // oculta a mitad de un ciclo: cierra el flujo y al volver lo pide de nuevo
    last().send("hello", hello());
    await flush();
    store.setVisible(false);
    expect(last().closed).toBe(true);
    store.setVisible(true);
    await flush();
    expect(FakeES.all).toHaveLength(3);

    // vuelve antes de que venza: respeta el tiempo restante
    await runCycle(last(), sign());
    vi.advanceTimersByTime(20_000);
    store.setVisible(false);
    store.setVisible(true);
    expect(store.getSnapshot().phase).toBe("waiting");
    vi.advanceTimersByTime(39_999);
    expect(FakeES.all).toHaveLength(3);
    vi.advanceTimersByTime(1);
    await flush();
    expect(FakeES.all).toHaveLength(4);
  });

  it("stop() cierra el flujo y cancela los temporizadores", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    last().send("hello", hello());
    await flush();
    store.stop();
    expect(last().closed).toBe(true);
    expect(store.getSnapshot().phase).toBe("idle");
    last().send("batch", sign()[0]); // eventos tardíos se ignoran
    await flush();
    expect(store.getSnapshot().stats.batchesOk).toBe(0);
    vi.advanceTimersByTime(600_000);
    expect(FakeES.all).toHaveLength(1);
  });

  it("ciclo sin focos: estado vacío, sin fallos", async () => {
    const { store, last } = setup();
    store.start();
    await flush();
    await runCycle(last(), [], 60, hello(kp, { total_detections: 0, total_batches: 0 }));
    const s = store.getSnapshot();
    expect(s.detections).toHaveLength(0);
    expect(s.stats).toMatchObject({ batchesOk: 0, batchesFailed: 0, cycles: 1 });
    expect(s.announce).toMatch(/no informó focos/);
  });
});

describe("DemoEngine.loadSigned (sandbox con lotes del servidor)", () => {
  const drain = (e: DemoEngine) => {
    for (let i = 0; i < 50 && !e.getSnapshot().done; i++) e.step();
    return e.getSnapshot();
  };
  it("verifica sin clave secreta y los ataques siguen funcionando", () => {
    const batches = sign();
    const e = new DemoEngine();
    e.loadSigned(batches, kp.publicKey, kp.keyId);
    expect(e.getSnapshot()).toMatchObject({ ready: true, presigned: true, keyOrigin: "server", keyId: kp.keyId, totalBatches: 3 });
    expect(drain(e).metrics).toMatchObject({ received: 3, valid: 3, tampered: 0 });

    e.reset();
    e.inject("tamper");
    const s = drain(e);
    expect(s.metrics).toMatchObject({ tampered: 1, lost: 1, valid: 2 });
    // el lote original del servidor no se muta
    expect(batches[0].payload.detections[0].frp).toBe(dets[0].frp);

    e.reset();
    e.step();
    e.inject("forge");
    expect(drain(e).metrics.forged).toBe(1);
  });
  it("suprimir el ÚLTIMO lote queda registrado como pérdida (total firmado + finalize)", () => {
    for (const presigned of [true, false]) {
      const e = new DemoEngine();
      if (presigned) e.loadSigned(sign(kp, dets, { total: true }), kp.publicKey, kp.keyId);
      else {
        e.setKey(kp, "qrng");
        e.load(dets);
      }
      e.step();
      e.step();
      e.step(); // quedan #1 y #2 en tránsito
      e.step(); // entrega #1; el #2 es el próximo y último
      e.inject("drop");
      const s = drain(e);
      expect(s.missing).toEqual([2]);
      expect(s.metrics).toMatchObject({ received: 2, valid: 2, lost: 1 });
    }
  });
  it("un lote auténtico de otro flujo es cadena rota: no suma como válido ni se dibuja como foco normal", () => {
    const mine = sign(kp, dets, { streamId: "a" });
    const alien = sign(kp, dets, { streamId: "b" });
    const e = new DemoEngine();
    e.loadSigned([mine[0], alien[1], mine[2]], kp.publicKey, kp.keyId);
    const s = drain(e);
    expect(s.metrics).toMatchObject({ valid: 2, chain: 1 });
    expect(s.points.filter((p) => p.status === "bad")).toHaveLength(5);
  });
  it("avisa cuando un ataque no se puede aplicar", () => {
    const e = new DemoEngine();
    e.loadSigned(sign(), kp.publicKey, kp.keyId);
    for (let i = 0; i < 4; i++) e.step(); // queda sólo el último en tránsito
    e.inject("reorder");
    expect(e.getSnapshot().log.some((l) => l.kind === "event" && /No se aplicó/.test(l.text))).toBe(true);
  });
  it("volver a un escenario local restaura la firma en el navegador", () => {
    const e = new DemoEngine();
    e.setKey(other, "qrng");
    e.loadSigned(sign(), kp.publicKey, kp.keyId);
    e.load(dets);
    expect(e.getSnapshot()).toMatchObject({ presigned: false, keyOrigin: "qrng", keyId: other.keyId });
    expect(drain(e).metrics.valid).toBe(3);
  });
});

describe("PollStore", () => {
  const ok = (x: unknown): x is { points: number[] } => !!x && Array.isArray((x as { points: unknown }).points);
  it("sondea por intervalo, conserva datos ante errores y reintenta antes", async () => {
    const fetchJson = vi
      .fn<(url: string) => Promise<unknown>>()
      .mockResolvedValueOnce({ points: [1] })
      .mockRejectedValueOnce(new Error("HTTP 502"))
      .mockResolvedValueOnce({ nada: true })
      .mockResolvedValue({ points: [2] });
    const p = new PollStore("/api/weather", 600_000, ok, { fetchJson, now: () => Date.now() });
    p.start();
    await flush();
    expect(p.getSnapshot()).toMatchObject({ data: { points: [1] }, error: null, loading: false });
    vi.advanceTimersByTime(600_000);
    await flush();
    expect(p.getSnapshot()).toMatchObject({ data: { points: [1] }, error: "HTTP 502" });
    vi.advanceTimersByTime(30_000);
    await flush();
    expect(p.getSnapshot().error).toMatch(/formato/);
    vi.advanceTimersByTime(30_000);
    await flush();
    expect(p.getSnapshot()).toMatchObject({ data: { points: [2] }, error: null });
    expect(fetchJson).toHaveBeenCalledTimes(4);
    p.stop();
  });
  it("no sondea con la pestaña oculta y se pone al día al volver", async () => {
    const fetchJson = vi.fn(async () => ({ points: [] }) as unknown);
    const p = new PollStore("/api/passes", 60_000, ok, { fetchJson, now: () => Date.now() });
    p.start();
    await flush();
    p.setVisible(false);
    vi.advanceTimersByTime(300_000);
    await flush();
    expect(fetchJson).toHaveBeenCalledTimes(1);
    p.setVisible(true);
    await flush();
    expect(fetchJson).toHaveBeenCalledTimes(2);
    p.stop();
    vi.advanceTimersByTime(300_000);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });
});
