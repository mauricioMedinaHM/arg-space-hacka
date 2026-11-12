import type { BatchPayload, FireDetection, SignedBatch } from "../types";
import { canonicalJSON, sha3, bytesToHex, toBase64 } from "./canonical";
import { ALG, signBytes, type KeyPair } from "./keys";

export const GENESIS_HASH = "0".repeat(64);

/** Hash del lote completo firmado — es lo que encadena el siguiente lote (prev_hash). */
export function batchLinkHash(b: SignedBatch): string {
  return bytesToHex(sha3(`${b.payload_hash}:${b.signature}`));
}

export interface CollectorOptions {
  streamId?: string;
  keyPair: KeyPair;
  now?: () => Date;
  /**
   * Total de lotes que tendrá la sesión, si se conoce de antemano (flujo finito). Se firma dentro
   * de cada payload como `total_batches`: el verificador puede así detectar un corte al final.
   */
  totalBatches?: number;
}

/** Recolector: agrupa detecciones, encadena y firma cada lote con ML-DSA-65. */
export class Collector {
  readonly streamId: string;
  private seq = 0;
  private prevHash = GENESIS_HASH;
  private readonly kp: KeyPair;
  private readonly now: () => Date;
  private readonly totalBatches?: number;

  constructor(opts: CollectorOptions) {
    if (opts.totalBatches !== undefined && (!Number.isSafeInteger(opts.totalBatches) || opts.totalBatches < 1)) {
      throw new Error("Collector: totalBatches debe ser un entero ≥ 1");
    }
    this.totalBatches = opts.totalBatches;
    this.streamId = opts.streamId ?? "salta-firms-viirs";
    this.kp = opts.keyPair;
    this.now = opts.now ?? (() => new Date());
  }

  get keyId() {
    return this.kp.keyId;
  }

  makeBatch(detections: FireDetection[]): SignedBatch {
    if (this.totalBatches !== undefined && this.seq >= this.totalBatches) {
      throw new Error(`Collector: la sesión declaró ${this.totalBatches} lotes y ya se emitieron todos`);
    }
    const payload: BatchPayload = {
      stream_id: this.streamId,
      seq: this.seq,
      prev_hash: this.prevHash,
      created_at: this.now().toISOString(),
      key_id: this.kp.keyId,
      detections,
      // undefined se omite del JSON canónico: sin total declarado el lote no cambia.
      total_batches: this.totalBatches,
    };
    if (payload.total_batches === undefined) delete payload.total_batches;
    const digest = sha3(canonicalJSON(payload));
    const signature = signBytes(digest, this.kp.secretKey);
    const batch: SignedBatch = {
      payload,
      payload_hash: bytesToHex(digest),
      signature: toBase64(signature),
      alg: ALG,
    };
    this.seq += 1;
    this.prevHash = batchLinkHash(batch);
    return batch;
  }
}
