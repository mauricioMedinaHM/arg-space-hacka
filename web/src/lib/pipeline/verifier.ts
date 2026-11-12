import type { SignedBatch, VerificationResult } from "../types";
import { canonicalJSON, sha3, bytesToHex, fromBase64Strict } from "./canonical";
import { ALG, SIZES, verifyBytes, keyIdOf } from "./keys";
import { batchLinkHash, GENESIS_HASH } from "./collector";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Salto máximo de seq que se acepta de una vez (evita marcar millones de "faltantes" por un seq absurdo). */
export const MAX_SEQ_JUMP = 100_000;

export interface VerifierOptions {
  /**
   * Flujo esperado. Si se omite, se fija con el primer lote válido (trust on first use).
   * Un lote firmado por una clave confiable pero para OTRO flujo se rechaza como `broken_chain`
   * (evita reinyectar lotes legítimos de otro stream firmado con la misma clave).
   */
  streamId?: string;
}

type Outcome = Omit<VerificationResult, "seq" | "verify_ms">;
const HEX64 = /^[0-9a-f]{64}$/;

/** Validación estructural mínima: nada de lo que sigue puede lanzar con una entrada arbitraria. */
function malformed(b: unknown): string | null {
  if (typeof b !== "object" || b === null) return "no es un objeto";
  const sb = b as Partial<SignedBatch>;
  const p = sb.payload as Partial<SignedBatch["payload"]> | undefined;
  if (typeof p !== "object" || p === null) return "falta el payload";
  if (typeof p.key_id !== "string") return "key_id inválido";
  if (typeof p.stream_id !== "string") return "stream_id inválido";
  if (!Number.isSafeInteger(p.seq) || (p.seq as number) < 0) return "seq inválido";
  if (typeof p.prev_hash !== "string" || !HEX64.test(p.prev_hash)) return "prev_hash inválido";
  if (!Array.isArray(p.detections)) return "detections inválido";
  if (p.total_batches !== undefined && (!Number.isSafeInteger(p.total_batches) || p.total_batches < 1)) return "total_batches inválido";
  if (typeof sb.payload_hash !== "string" || typeof sb.signature !== "string") return "hash o firma ausentes";
  return null;
}

/**
 * Consumidor/verificador. Clasifica cada lote (corta en la primera comprobación que falla):
 * - tampered: lote mal formado, algoritmo inesperado, hash o firma ML-DSA inválidos
 * - unknown_key: lote firmado por una clave no confiable
 * - duplicate: el mismo lote (mismo hash) ya fue aceptado → replay
 * - gap: faltan lotes (pérdida); se reporta al detectar el salto
 * - reordered: llega tarde un seq que estaba marcado como faltante y encaja en la cadena
 * - broken_chain: firma válida pero el lote no encaja en la cadena: prev_hash no coincide con su
 *   vecino aceptado (también al llegar tarde), dos lotes distintos comparten seq (bifurcación) o
 *   pertenece a otro stream.
 *
 * Límite conocido: la pérdida de los ÚLTIMOS lotes no deja rastro en la secuencia. Sólo se detecta
 * si llega un lote posterior, si el emisor firmó el total de la sesión (`total_batches`, ver
 * `Collector({ totalBatches })`) o si el consumidor lo conoce por otro canal autenticado
 * (`finalize(expectedCount)`).
 */
export class Verifier {
  private trusted = new Map<string, Uint8Array>();
  /** Lotes aceptados por seq: hash del payload, eslabón propio y prev_hash declarado. */
  private bySeq = new Map<number, { digest: string; link: string; prev: string }>();
  private seenHash = new Set<string>();
  private missing = new Set<number>();
  private expected = 0;
  private stream: string | null;
  private total: number | null = null;
  readonly results: VerificationResult[] = [];

  constructor(trustedPublicKeys: Uint8Array[], opts: VerifierOptions = {}) {
    for (const pk of trustedPublicKeys) this.trusted.set(keyIdOf(pk), pk);
    this.stream = opts.streamId ?? null;
  }

  get expectedSeq() {
    return this.expected;
  }

  get missingSeqs() {
    return [...this.missing].sort((a, b) => a - b);
  }

  /** Total de lotes de la sesión declarado por el emisor dentro de un payload firmado (o null). */
  get declaredTotal() {
    return this.total;
  }

  /** stream_id fijado (por opción o por el primer lote válido). */
  get streamId() {
    return this.stream;
  }

  ingest(b: SignedBatch): VerificationResult {
    const t0 = now();
    let r: Outcome;
    try {
      r = this.check(b);
    } catch {
      // Nunca propagar: una entrada hostil no debe tumbar al consumidor.
      r = { status: "tampered", detail: "Lote ilegible: no se pudo procesar." };
    }
    const seq = Number.isSafeInteger(b?.payload?.seq) ? b.payload.seq : -1;
    const res: VerificationResult = { ...r, seq, verify_ms: +(now() - t0).toFixed(3) };
    this.results.push(res);
    return res;
  }

  private check(b: SignedBatch): Outcome {
    const bad = malformed(b);
    if (bad) return { status: "tampered", detail: `Lote mal formado (${bad}).` };
    const p = b.payload;
    if (b.alg !== ALG) return { status: "tampered", detail: `Algoritmo inesperado: se exige ${ALG}.` };

    const pk = this.trusted.get(p.key_id);
    if (!pk) return { status: "unknown_key", detail: `Clave ${p.key_id.slice(0, 8)}… no está en la lista de confianza: posible falsificación.` };

    const digest = sha3(canonicalJSON(p));
    const digestHex = bytesToHex(digest);
    if (digestHex !== b.payload_hash) return { status: "tampered", detail: "El contenido del lote no coincide con su hash: datos alterados en tránsito." };
    let sig: Uint8Array;
    try {
      sig = fromBase64Strict(b.signature);
    } catch {
      return { status: "tampered", detail: "Firma ilegible o con codificación no canónica." };
    }
    if (sig.length !== SIZES.signature || !verifyBytes(sig, digest, pk)) {
      return { status: "tampered", detail: "Firma ML-DSA-65 inválida: el lote fue modificado o no lo firmó el recolector." };
    }

    // A partir de acá el lote es auténtico (lo firmó una clave confiable). Falta ubicarlo en el flujo.
    if (this.stream !== null && p.stream_id !== this.stream) {
      return { status: "broken_chain", detail: `Firma válida, pero el lote pertenece a otro flujo ("${p.stream_id.slice(0, 40)}"): no forma parte de esta cadena.` };
    }

    // Total firmado de la sesión: debe ser coherente entre lotes y ningún seq puede excederlo.
    if (p.total_batches !== undefined) {
      if (this.total !== null && p.total_batches !== this.total) {
        return { status: "broken_chain", detail: `Firma válida, pero el lote declara ${p.total_batches} lotes en la sesión y antes se declararon ${this.total}: no es la misma cadena.` };
      }
      if (p.seq >= p.total_batches) {
        return { status: "broken_chain", detail: `Firma válida, pero el #${p.seq} excede el total declarado de la sesión (${p.total_batches}).` };
      }
    } else if (this.total !== null && p.seq >= this.total) {
      return { status: "broken_chain", detail: `Firma válida, pero el #${p.seq} excede el total declarado de la sesión (${this.total}).` };
    }

    if (this.seenHash.has(digestHex)) {
      return { status: "duplicate", detail: `Lote #${p.seq} repetido (replay o reenvío duplicado). Se descarta.` };
    }
    const twin = this.bySeq.get(p.seq);
    if (twin) {
      return { status: "broken_chain", detail: `Firma válida, pero ya se aceptó otro lote distinto con el #${p.seq}: bifurcación del flujo. Se conserva el primero.` };
    }
    if (p.seq - this.expected > MAX_SEQ_JUMP) {
      return { status: "broken_chain", detail: `Firma válida, pero el #${p.seq} salta más de ${MAX_SEQ_JUMP} lotes respecto del esperado (#${this.expected}). Se descarta.` };
    }

    if (this.stream === null) this.stream = p.stream_id;
    if (this.total === null && p.total_batches !== undefined) this.total = p.total_batches;
    const link = batchLinkHash(b);
    this.seenHash.add(digestHex);
    this.bySeq.set(p.seq, { digest: digestHex, link, prev: p.prev_hash });

    // Cadena: contra el anterior aceptado (si lo hay) y contra el siguiente (si ya había llegado).
    const before = p.seq === 0 ? GENESIS_HASH : this.bySeq.get(p.seq - 1)?.link;
    const after = this.bySeq.get(p.seq + 1)?.prev;
    const chainBroken = (before !== undefined && before !== p.prev_hash) || (after !== undefined && after !== link);

    if (p.seq < this.expected) {
      this.missing.delete(p.seq);
      if (chainBroken) {
        return { status: "broken_chain", detail: `Lote #${p.seq} llegó fuera de orden y no encaja en la cadena prev_hash de sus vecinos: bifurcación del flujo.` };
      }
      return { status: "reordered", detail: `Lote #${p.seq} llegó fuera de orden (se esperaba ≥ #${this.expected}). Firma válida y cadena consistente; se reubica.` };
    }

    if (p.seq > this.expected) {
      const missing: number[] = [];
      for (let s = this.expected; s < p.seq; s++) {
        if (!this.bySeq.has(s)) {
          missing.push(s);
          this.missing.add(s);
        }
      }
      this.expected = p.seq + 1;
      const shown = missing.length > 8 ? `#${missing.slice(0, 8).join(", #")}… (#${missing[missing.length - 1]})` : `#${missing.join(", #")}`;
      return { status: "gap", detail: `Faltan ${missing.length} lote(s): ${shown}. Posible pérdida o supresión.`, missing_seqs: missing };
    }

    this.expected = p.seq + 1;
    if (chainBroken) {
      return { status: "broken_chain", detail: "Firma válida pero la cadena prev_hash no coincide con el lote anterior: bifurcación del flujo." };
    }
    return { status: "ok", detail: "Firma ML-DSA-65 válida, cadena íntegra." };
  }

  /**
   * Resumen al cerrar el flujo: lotes que nunca llegaron.
   * Para reportar también los lotes perdidos al FINAL del flujo (indetectables por la secuencia)
   * hace falta el total de la sesión. Se toma, en este orden:
   * 1. del `total_batches` firmado dentro de los lotes aceptados (`declaredTotal`), que es auténtico;
   * 2. de `expectedCount`, que el consumidor debe obtener de una fuente autenticada: si viaja sin
   *    firmar por el mismo canal, quien suprime los últimos lotes también puede alterar ese número.
   * Si no llegó NINGÚN lote y no hay `expectedCount`, la supresión total sigue siendo invisible.
   */
  finalize(expectedCount?: number): VerificationResult[] {
    const lost = new Set(this.missing);
    const known = this.total ?? (expectedCount !== undefined && Number.isSafeInteger(expectedCount) ? expectedCount : null);
    if (known !== null) {
      const upTo = Math.min(known, this.expected + MAX_SEQ_JUMP);
      for (let s = this.expected; s < upTo; s++) lost.add(s);
    }
    return [...lost]
      .sort((a, b) => a - b)
      .map((seq) => ({ seq, status: "gap" as const, detail: `Lote #${seq} nunca llegó.`, verify_ms: 0, missing_seqs: [seq] }));
  }
}
