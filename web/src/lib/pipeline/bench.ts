import type { FireDetection, SignedBatch } from "../types";
import { utf8ToBytes } from "./canonical";
import { Collector } from "./collector";
import { Verifier } from "./verifier";
import { generateKeyPair, SIZES } from "./keys";

export interface BenchResult {
  batches: number;
  detections_per_batch: number;
  keygen_ms: number;
  sign_ms_avg: number;
  verify_ms_avg: number;
  batches_per_s: number;
  detections_per_s: number;
  sig_bytes: number;
  pk_bytes: number;
  overhead_pct: number;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function runBenchmark(n: number, sample: FireDetection[], perBatch = 10): BenchResult {
  if (!Number.isInteger(n) || n < 1) throw new Error("runBenchmark: n debe ser un entero ≥ 1");
  let t = now();
  const kp = generateKeyPair();
  const keygen_ms = now() - t;
  const c = new Collector({ keyPair: kp });
  const batches: SignedBatch[] = [];
  t = now();
  for (let i = 0; i < n; i++) {
    const start = (i * perBatch) % Math.max(1, sample.length);
    batches.push(c.makeBatch(sample.slice(start, start + perBatch)));
  }
  const signTotal = now() - t;
  const v = new Verifier([kp.publicKey]);
  t = now();
  for (const b of batches) v.ingest(b);
  const verifyTotal = now() - t;
  return summarize(n, perBatch, keygen_ms, signTotal, verifyTotal, batches);
}

/**
 * Igual que `runBenchmark`, pero cede el hilo principal entre lotes para que la página no se
 * congele (cada firma/verificación dura unos milisegundos; el total, cerca de un segundo).
 * Sólo se cronometra el trabajo criptográfico, no las pausas.
 */
export async function runBenchmarkAsync(
  n: number,
  sample: FireDetection[],
  perBatch = 10,
  onProgress?: (done: number, total: number) => void,
): Promise<BenchResult> {
  if (!Number.isInteger(n) || n < 1) throw new Error("runBenchmark: n debe ser un entero ≥ 1");
  const pause = () => new Promise<void>((res) => setTimeout(res, 0));
  let t = now();
  const kp = generateKeyPair();
  const keygen_ms = now() - t;
  const c = new Collector({ keyPair: kp });
  const v = new Verifier([kp.publicKey]);
  const batches: SignedBatch[] = [];
  let signTotal = 0;
  let verifyTotal = 0;
  for (let i = 0; i < n; i++) {
    await pause();
    const start = (i * perBatch) % Math.max(1, sample.length);
    t = now();
    const b = c.makeBatch(sample.slice(start, start + perBatch));
    signTotal += now() - t;
    await pause();
    t = now();
    const r = v.ingest(b);
    verifyTotal += now() - t;
    if (r.status !== "ok") throw new Error(`benchmark: verificación inesperada (${r.status})`);
    batches.push(b);
    onProgress?.(i + 1, n);
  }
  return summarize(n, perBatch, keygen_ms, signTotal, verifyTotal, batches);
}

function summarize(
  n: number,
  perBatch: number,
  keygen_ms: number,
  signTotal: number,
  verifyTotal: number,
  batches: SignedBatch[],
): BenchResult {
  const payloadBytes = Math.max(1, batches.reduce((a, b) => a + utf8ToBytes(JSON.stringify(b.payload)).length, 0) / n);
  const total = Math.max(signTotal + verifyTotal, 1e-6);
  return {
    batches: n,
    detections_per_batch: perBatch,
    keygen_ms: +keygen_ms.toFixed(2),
    sign_ms_avg: +(signTotal / n).toFixed(2),
    verify_ms_avg: +(verifyTotal / n).toFixed(2),
    batches_per_s: +((n / total) * 1000).toFixed(1),
    detections_per_s: +(((n * perBatch) / total) * 1000).toFixed(0),
    sig_bytes: SIZES.signature,
    pk_bytes: SIZES.publicKey,
    overhead_pct: +((SIZES.signature * 4) / 3 / payloadBytes * 100).toFixed(1),
  };
}
