import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { sha3hex } from "./canonical";

export const ALG = "ML-DSA-65" as const;
/** Separación de dominio FIPS 204 (context string). */
export const CONTEXT = new TextEncoder().encode("salta-firms-integrity/v1");

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  keyId: string;
}

export function keyIdOf(publicKey: Uint8Array): string {
  return sha3hex(publicKey).slice(0, 32);
}

/** Genera un par ML-DSA-65. `seed` (32 bytes) permite claves determinísticas (p.ej. semilla QRNG). */
export function generateKeyPair(seed?: Uint8Array): KeyPair {
  const s = seed ?? randomBytes(32);
  if (s.length !== 32) throw new Error("La semilla ML-DSA debe tener 32 bytes");
  const { publicKey, secretKey } = ml_dsa65.keygen(s);
  return { publicKey, secretKey, keyId: keyIdOf(publicKey) };
}

export function signBytes(msg: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ml_dsa65.sign(msg, secretKey, { context: CONTEXT });
}

export function verifyBytes(sig: Uint8Array, msg: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ml_dsa65.verify(sig, msg, publicKey, { context: CONTEXT });
  } catch {
    return false;
  }
}

export const SIZES = {
  publicKey: ml_dsa65.lengths.publicKey ?? 1952,
  secretKey: ml_dsa65.lengths.secretKey ?? 4032,
  signature: ml_dsa65.lengths.signature ?? 3309,
};
