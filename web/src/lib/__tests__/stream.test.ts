import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Verifier, fromBase64 } from "../pipeline";
import type { SignedBatch } from "../types";

// Los módulos del servidor importan "server-only" (lanza fuera de RSC) y `cacheLife` (exige `use cache`).
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const HEAD = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight";
const row = (i: number, sat: string) =>
  `${(-24 - i * 0.01).toFixed(5)},${(-64 - i * 0.01).toFixed(5)},330.1,0.4,0.5,2026-11-12,${String(1700 + i)},${sat},nominal,2.0NRT,295.2,${5 + i},D`;
const CSV_N20 = [HEAD, ...Array.from({ length: 7 }, (_, i) => row(i, "N20")), "-34.6,-58.4,330,0.4,0.5,2026-11-12,1700,N20,nominal,2.0NRT,295,5,D"].join("\n");
const CSV_N21 = [HEAD, ...Array.from({ length: 4 }, (_, i) => row(i + 20, "N21"))].join("\n");
const MODIS = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight
-25.5,-64.9,320.4,1.1,1.0,2026-11-12,1445,T,85,6.1NRT,298.7,22.3,D`;

function mockFirms(handler: (url: string) => string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const body = handler(String(input));
      return body === null ? new Response("down", { status: 503 }) : new Response(body, { status: 200 });
    }),
  );
}

interface SseEvent {
  event: string;
  data: unknown;
}

async function readSse(res: Response): Promise<{ events: SseEvent[]; raw: string }> {
  const raw = await res.text();
  const events: SseEvent[] = [];
  for (const block of raw.split("\n\n")) {
    const ev = block.split("\n").find((l) => l.startsWith("event: "));
    const data = block.split("\n").find((l) => l.startsWith("data: "));
    if (ev && data) events.push({ event: ev.slice(7), data: JSON.parse(data.slice(6)) });
  }
  return { events, raw };
}

beforeEach(() => {
  vi.resetModules();
  delete process.env.FIRMS_MAP_KEY;
  delete process.env.COLLECTOR_SEED_HEX;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createFirmsStream (SSE)", () => {
  it("emite hello → batch × N → done con lotes firmados y encadenados que el Verifier acepta", async () => {
    mockFirms((url) => (url.includes("J1_") ? CSV_N20 : url.includes("J2_") ? CSV_N21 : url.includes("MODIS") ? MODIS : null));
    const { getLiveFirms } = await import("../server/firms-live");
    const { STREAM_ID, getCollectorKey, getCollectorInfo } = await import("../server/collector-key");
    const { createFirmsStream, SSE_HEADERS } = await import("../server/sse");

    // En producción `use cache` devuelve el mismo resultado (mismo fetched_at) durante el ciclo.
    const feed = await getLiveFirms(1);
    const stream = createFirmsStream({
      feed: Promise.resolve(feed),
      getKeyPair: () => getCollectorKey().keyPair,
      streamId: STREAM_ID,
      seedOrigin: getCollectorKey().seed_origin,
      batchSize: 5,
      intervalMs: 1,
    });
    const { events, raw } = await readSse(new Response(stream, { headers: SSE_HEADERS }));

    expect(raw.startsWith("retry: 60000\n")).toBe(true);
    expect(events.map((e) => e.event)).toEqual(["hello", "batch", "batch", "batch", "done"]);

    const hello = events[0].data as Record<string, unknown>;
    const info = getCollectorInfo();
    expect(info.seed_origin).toBe("qrng-demo");
    expect(hello).toMatchObject({
      key_id: info.key_id,
      public_key_b64: info.public_key_b64,
      stream_base: info.stream_id,
      stream_id: `${info.stream_id}:${hello.cycle_id}`,
      seed_origin: "qrng-demo",
      source: "firms-live",
      origin: "firms-public-24h",
      total_detections: 12, // 7 N20 + 4 N21 + 1 Terra (la fila de Buenos Aires queda fuera del bbox)
      total_batches: 3,
    });
    expect(typeof hello.fetched_at).toBe("string");

    const batches = events.filter((e) => e.event === "batch").map((e) => e.data as SignedBatch);
    expect(batches.map((b) => b.payload.seq)).toEqual([0, 1, 2]);
    expect(batches.map((b) => b.payload.detections.length)).toEqual([5, 5, 2]);
    expect(batches.every((b) => b.alg === "ML-DSA-65" && b.payload.stream_id === hello.stream_id && b.payload.total_batches === 3)).toBe(true);
    expect(String(hello.cycle_id)).toMatch(/^\d{8}T\d{6}Z-[0-9a-f]{12}$/);
    const sats = new Set(batches.flatMap((b) => b.payload.detections.map((d) => d.satellite)));
    expect([...sats].sort()).toEqual(["N20", "N21", "Terra"]);

    // Separación emisor/consumidor: se verifica solo con la clave pública anunciada.
    const verifier = new Verifier([fromBase64(String(hello.public_key_b64))], { streamId: String(hello.stream_id) });
    expect(batches.map((b) => verifier.ingest(b).status)).toEqual(["ok", "ok", "ok"]);
    expect(verifier.declaredTotal).toBe(3);
    expect(verifier.finalize()).toEqual([]);

    // Supresión del último lote: el total firmado la delata aunque `done` se reescriba.
    const cut = new Verifier([fromBase64(String(hello.public_key_b64))], { streamId: String(hello.stream_id) });
    batches.slice(0, 2).forEach((b) => cut.ingest(b));
    expect(cut.finalize().map((r) => r.seq)).toEqual([2]);

    // Segunda conexión al MISMO ciclo: mismos lotes byte a byte (se firman una sola vez).
    const again = await readSse(
      new Response(createFirmsStream({ feed: Promise.resolve(feed), getKeyPair: () => getCollectorKey().keyPair, streamId: STREAM_ID, batchSize: 5, intervalMs: 1 })),
    );
    const sigs = (evs: SseEvent[]) => evs.filter((e) => e.event === "batch").map((e) => (e.data as SignedBatch).signature);
    expect(sigs(again.events).every((sig, i) => sig === batches[i].signature)).toBe(true);
    expect(sigs(again.events)).toHaveLength(3);

    // Replay: un ciclo posterior (otro fetched_at) tiene otro stream_id; los lotes viejos no verifican "ok".
    const later = await readSse(
      new Response(
        createFirmsStream({
          feed: Promise.resolve({ ...feed, fetched_at: new Date(Date.parse(feed.fetched_at) + 600_000).toISOString() }),
          getKeyPair: () => getCollectorKey().keyPair,
          streamId: STREAM_ID,
          batchSize: 5,
          intervalMs: 1,
        }),
      ),
    );
    const hello2 = later.events[0].data as { stream_id: string; cycle_id: string };
    expect(hello2.stream_id).not.toBe(hello.stream_id);
    expect(hello2.cycle_id > String(hello.cycle_id)).toBe(true);
    const v2 = new Verifier([fromBase64(String(hello.public_key_b64))], { streamId: hello2.stream_id });
    expect(batches.map((b) => v2.ingest(b).status)).toEqual(["broken_chain", "broken_chain", "broken_chain"]);

    expect(events.at(-1)!.data).toEqual({ batches: 3, next_poll_s: 60 });
  });

  it("sin focos: hello con total 0 y done, sin lotes", async () => {
    mockFirms(() => HEAD + "\n");
    const { getLiveFirms } = await import("../server/firms-live");
    const { STREAM_ID, getCollectorKey } = await import("../server/collector-key");
    const { createFirmsStream } = await import("../server/sse");
    const { events } = await readSse(
      new Response(createFirmsStream({ feed: getLiveFirms(1), getKeyPair: () => getCollectorKey().keyPair, streamId: STREAM_ID })),
    );
    expect(events.map((e) => e.event)).toEqual(["hello", "done"]);
    expect(events[0].data).toMatchObject({ source: "firms-live", total_detections: 0, total_batches: 0 });
    expect(events[1].data).toEqual({ batches: 0, next_poll_s: 60 });
  });

  it("FIRMS caído: degrada al snapshot y nunca supera 60 lotes", async () => {
    mockFirms(() => null);
    const { getLiveFirms } = await import("../server/firms-live");
    const { STREAM_ID, getCollectorKey } = await import("../server/collector-key");
    const { createFirmsStream } = await import("../server/sse");
    const feed = await getLiveFirms(1);
    expect(feed).toMatchObject({ source: "historical", origin: "local-snapshot", degraded: true });
    const { events } = await readSse(
      new Response(
        createFirmsStream({ feed: Promise.resolve(feed), getKeyPair: () => getCollectorKey().keyPair, streamId: STREAM_ID, batchSize: 1, intervalMs: 0 }),
      ),
    );
    const hello = events[0].data as { total_detections: number; total_batches: number; degraded: boolean; source: string };
    expect(hello.source).toBe("historical");
    expect(hello.degraded).toBe(true);
    expect(hello.total_batches).toBeLessThanOrEqual(60);
    const batches = events.filter((e) => e.event === "batch").map((e) => e.data as SignedBatch);
    expect(batches).toHaveLength(hello.total_batches);
    expect(batches.reduce((a, b) => a + b.payload.detections.length, 0)).toBe(hello.total_detections);
  }, 30_000);

  it("emite `error` si no hay clave y cierra", async () => {
    const { createFirmsStream } = await import("../server/sse");
    const feed = Promise.resolve({ source: "firms-live", origin: "x", fetched_at: "t", detections: [] });
    const { events } = await readSse(
      new Response(createFirmsStream({ feed, getKeyPair: () => { throw new Error("sin clave"); }, streamId: "s" })),
    );
    expect(events).toEqual([{ event: "error", data: { message: "sin clave" } }]);
  });

  it("manda pings mientras espera y corta al abortar el cliente", async () => {
    vi.useFakeTimers();
    const { createFirmsStream } = await import("../server/sse");
    const { generateKeyPair } = await import("../pipeline");
    const kp = generateKeyPair(new Uint8Array(32).fill(3));
    const ac = new AbortController();
    const dets = (await import("../firms-historical")).loadHistorical().slice(0, 50);
    const stream = createFirmsStream({
      feed: Promise.resolve({ source: "firms-live", origin: "x", fetched_at: "t", detections: dets }),
      getKeyPair: () => kp,
      streamId: "s",
      batchSize: 5,
      intervalMs: 700,
      pingMs: 1000,
      signal: ac.signal,
    });
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let text = "";
    const pump = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        text += dec.decode(value);
      }
    })();
    await vi.advanceTimersByTimeAsync(2500); // t=0, 700, 1400, 2100 → 4 lotes; pings en 1000 y 2000
    ac.abort();
    await pump; // el stream se cierra sin esperar los 6 lotes restantes
    expect(text.match(/^event: batch$/gm)).toHaveLength(4);
    expect(text.match(/^: ping$/gm)).toHaveLength(2);
    expect(text).not.toContain("event: done");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("parámetros y presupuesto", () => {
  it("clampBatchSize: vacío → 5; solo tamaños permitidos", async () => {
    const { clampBatchSize } = await import("../server/sse");
    expect(["", null, undefined, "abc", "0", "5", "6", "10", "11", "26", "999"].map(clampBatchSize)).toEqual([
      5, 5, 5, 5, 5, 5, 10, 10, 25, 50, 50,
    ]);
  });

  it("si el fetch consumió el presupuesto, los lotes salen sin esperar", async () => {
    const { createFirmsStream } = await import("../server/sse");
    const { generateKeyPair } = await import("../pipeline");
    const kp = generateKeyPair(new Uint8Array(32).fill(4));
    const dets = (await import("../firms-historical")).loadHistorical().slice(0, 30);
    const t0 = Date.now();
    const { events } = await readSse(
      new Response(
        createFirmsStream({
          feed: Promise.resolve({ source: "firms-live", origin: "x", fetched_at: "2026-11-12T00:00:00.000Z", detections: dets }),
          getKeyPair: () => kp,
          streamId: "s",
          intervalMs: 700,
          budgetMs: 0,
        }),
      ),
    );
    expect(events.filter((e) => e.event === "batch")).toHaveLength(6);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("caché negativa: con FIRMS caído el segundo pedido no vuelve a hacer fetch", async () => {
    mockFirms(() => null);
    const { getLiveFirms } = await import("../server/firms-live");
    const a = await getLiveFirms(1);
    const calls = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(calls).toBe(4);
    const b = await getLiveFirms("");
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls);
    expect(b.fetched_at).toBe(a.fetched_at);
    expect(b.degraded).toBe(true);
  });
});

describe("collector-key", () => {
  it("usa COLLECTOR_SEED_HEX si es válida y cae a la semilla QRNG si no", async () => {
    const { getCollectorInfo } = await import("../server/collector-key");
    const demo = getCollectorInfo();
    expect(demo).toMatchObject({ alg: "ML-DSA-65", seed_origin: "qrng-demo", stream_id: "salta-firms-live" });
    expect(demo.key_id).toMatch(/^[0-9a-f]{32}$/);
    expect(fromBase64(demo.public_key_b64)).toHaveLength(1952);

    process.env.COLLECTOR_SEED_HEX = "ab".repeat(32);
    const env = getCollectorInfo();
    expect(env.seed_origin).toBe("env");
    expect(env.key_id).not.toBe(demo.key_id);

    process.env.COLLECTOR_SEED_HEX = "xyz";
    const bad = getCollectorInfo();
    expect(bad.seed_origin).toBe("qrng-demo");
    expect(bad.key_id).toBe(demo.key_id);
    expect(bad.note).toMatch(/inválida/);
  });
});

describe("getLiveFirms con FIRMS_MAP_KEY", () => {
  it("consulta los 4 productos en paralelo, tolera fallos individuales y no filtra la clave", async () => {
    process.env.FIRMS_MAP_KEY = "SECRETKEY123";
    const urls: string[] = [];
    mockFirms((url) => {
      urls.push(url);
      if (url.includes("VIIRS_NOAA20_NRT")) return CSV_N20;
      if (url.includes("VIIRS_NOAA21_NRT")) return CSV_N21;
      if (url.includes("VIIRS_SNPP_NRT")) return "Invalid MAP_KEY."; // 200 sin CSV
      return null; // MODIS_NRT → 503
    });
    const { getLiveFirms } = await import("../server/firms-live");
    const r = await getLiveFirms("3");
    expect(urls).toHaveLength(4);
    expect(urls.every((u) => u.includes("/api/area/csv/SECRETKEY123/") && u.endsWith("/3"))).toBe(true);
    expect(r).toMatchObject({ source: "firms-live", origin: "firms-area-api", days: 3 });
    expect(r.detections).toHaveLength(11);
    expect(r.sources).toEqual([
      { id: "VIIRS_NOAA20_NRT", ok: true, count: 7 },
      { id: "VIIRS_NOAA21_NRT", ok: true, count: 4 },
      { id: "VIIRS_SNPP_NRT", ok: false, count: 0, error: "respuesta inesperada de FIRMS (no es CSV)" },
      { id: "MODIS_NRT", ok: false, count: 0, error: "FIRMS HTTP 503" },
    ]);
    expect(JSON.stringify(r)).not.toContain("SECRETKEY123");
  });

  it("si el área API falla entera cae a los CSV públicos", async () => {
    process.env.FIRMS_MAP_KEY = "SECRETKEY123";
    mockFirms((url) => (url.includes("/api/area/") ? null : url.includes("J2_") ? CSV_N21 : null));
    const { getLiveFirms } = await import("../server/firms-live");
    const r = await getLiveFirms(1);
    expect(r).toMatchObject({ source: "firms-live", origin: "firms-public-24h" });
    expect(r.detections).toHaveLength(4);
    expect(r.errors).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("SECRETKEY123");
  });
});
