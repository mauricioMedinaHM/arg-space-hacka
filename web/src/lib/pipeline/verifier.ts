import type { SignedBatch, VerificationResult } from "../types";
import { canonicalJSON, sha3, bytesToHex, fromBase64 } from "./canonical";
import { verifyBytes, keyIdOf } from "./keys";
import { batchLinkHash, GENESIS_HASH } from "./collector";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Consumidor/verificador. Detecta:
 * - tampered: hash o firma ML-DSA inválidos
 * - unknown_key: lote firmado por una clave no confiable
 * - duplicate: seq/hash ya vistos
 * - gap: faltan lotes (pérdida); se reporta al detectar el salto
 * - reordered: llega tarde un seq que estaba marcado como faltante
 * - broken_chain: prev_hash no coincide con el lote anterior aceptado
 */
export class Verifier {
  private trusted = new Map<string, Uint8Array>();
  private seenSeq = new Set<number>();
  private seenHash = new Set<string>();
  private missing = new Set<number>();
  private linkBySeq = new Map<number, string>();
  private expected = 0;
  readonly results: VerificationResult[] = [];

  constructor(trustedPublicKeys: Uint8Array[]) {
    for (const pk of trustedPublicKeys) this.trusted.set(keyIdOf(pk), pk);
  }

  get expectedSeq() {
    return this.expected;
  }

  get missingSeqs() {
    return [...this.missing].sort((a, b) => a - b);
  }

  ingest(b: SignedBatch): VerificationResult {
    const t0 = now();
    const r = this.check(b);
    const res: VerificationResult = { ...r, seq: b.payload?.seq ?? -1, verify_ms: +(now() - t0).toFixed(3) };
    this.results.push(res);
    return res;
  }

  private check(b: SignedBatch): Omit<VerificationResult, "seq" | "verify_ms"> {
    const p = b.payload;
    const pk = this.trusted.get(p.key_id);
    if (!pk) return { status: "unknown_key", detail: `Clave ${p.key_id.slice(0, 8)}… no está en la lista de confianza: posible falsificación.` };

    const digest = sha3(canonicalJSON(p));
    const digestHex = bytesToHex(digest);
    if (digestHex !== b.payload_hash) return { status: "tampered", detail: "El contenido del lote no coincide con su hash: datos alterados en tránsito." };
    let sig: Uint8Array;
    try {
      sig = fromBase64(b.signature);
    } catch {
      return { status: "tampered", detail: "Firma ilegible." };
    }
    if (!verifyBytes(sig, digest, pk)) return { status: "tampered", detail: "Firma ML-DSA-65 inválida: el lote fue modificado o no lo firmó el recolector." };

    if (this.seenHash.has(digestHex) || this.seenSeq.has(p.seq)) {
      return { status: "duplicate", detail: `Lote #${p.seq} repetido (replay o reenvío duplicado). Se descarta.` };
    }

    const link = batchLinkHash(b);
    this.seenHash.add(digestHex);
    this.seenSeq.add(p.seq);
    this.linkBySeq.set(p.seq, link);

    if (p.seq < this.expected) {
      this.missing.delete(p.seq);
      return { status: "reordered", detail: `Lote #${p.seq} llegó fuera de orden (se esperaba ≥ #${this.expected}). Firma válida; se reubica.` };
    }

    if (p.seq > this.expected) {
      const missing: number[] = [];
      for (let s = this.expected; s < p.seq; s++) {
        if (!this.seenSeq.has(s)) {
          missing.push(s);
          this.missing.add(s);
        }
      }
      this.expected = p.seq + 1;
      if (missing.length) {
        return { status: "gap", detail: `Faltan ${missing.length} lote(s): #${missing.join(", #")}. Posible pérdida o supresión.`, missing_seqs: missing };
      }
      return { status: "ok", detail: "Firma válida." };
    }

    this.expected = p.seq + 1;
    const expectedPrev = p.seq === 0 ? GENESIS_HASH : this.linkBySeq.get(p.seq - 1);
    if (expectedPrev && expectedPrev !== p.prev_hash) {
      return { status: "broken_chain", detail: "Firma válida pero la cadena prev_hash no coincide con el lote anterior: bifurcación del flujo." };
    }
    return { status: "ok", detail: "Firma ML-DSA-65 válida, cadena íntegra." };
  }

  /** Resumen al cerrar el flujo: lotes que nunca llegaron. */
  finalize(): VerificationResult[] {
    return this.missingSeqs.map((seq) => ({ seq, status: "gap" as const, detail: `Lote #${seq} nunca llegó.`, verify_ms: 0, missing_seqs: [seq] }));
  }
}
