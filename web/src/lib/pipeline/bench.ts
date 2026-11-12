import type { FireDetection } from "../types";
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
  let t = now();
  const kp = generateKeyPair();
  const keygen_ms = now() - t;
  const c = new Collector({ keyPair: kp });
  const batches = [];
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
  const payloadBytes = batches.reduce((a, b) => a + JSON.stringify(b.payload).length, 0) / n;
  const total = signTotal + verifyTotal;
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
