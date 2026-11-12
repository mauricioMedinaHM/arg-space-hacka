// Clave ML-DSA-65 del recolector del SERVIDOR.
// Semilla: env COLLECTOR_SEED_HEX (64 hex = 32 bytes). Fallback: `seed_hex` de
// public/quantum/qrng.json (semilla QRNG simulada, PÚBLICA → solo demo).
// El JSON se importa (no se lee con fs) para que quede dentro del bundle de la función en Vercel.
import "server-only";
import qrng from "../../../public/quantum/qrng.json";
import { generateKeyPair, hexToBytes, toBase64, type KeyPair } from "../pipeline";

/**
 * Prefijo del flujo. El stream_id firmado en cada lote es `${STREAM_ID}:${cycle_id}`
 * (un flujo por ciclo de FIRMS, ver lib/server/sse.ts); /api/collector publica el prefijo.
 */
export const STREAM_ID = "salta-firms-live";

export type SeedOrigin = "env" | "qrng-demo";

export interface CollectorKey {
  keyPair: KeyPair;
  seed_origin: SeedOrigin;
  note?: string;
}

export interface CollectorInfo {
  alg: "ML-DSA-65";
  key_id: string;
  public_key_b64: string;
  stream_id: string;
  seed_origin: SeedOrigin;
  note?: string;
}

const HEX64 = /^[0-9a-f]{64}$/i;

let cached: { seedHex: string; value: CollectorKey } | null = null;

/** Par de claves del recolector (memoizado por semilla; keygen ML-DSA-65 cuesta unos ms). */
export function getCollectorKey(): CollectorKey {
  const env = (process.env.COLLECTOR_SEED_HEX ?? "").trim();
  const envValid = HEX64.test(env);
  const demo = String((qrng as { seed_hex?: unknown }).seed_hex ?? "");
  let seedHex: string;
  let seed_origin: SeedOrigin;
  let note: string | undefined;
  if (envValid) {
    seedHex = env;
    seed_origin = "env";
  } else {
    if (!HEX64.test(demo)) throw new Error("qrng.json no tiene un seed_hex válido (64 hex)");
    seedHex = demo;
    seed_origin = "qrng-demo";
    note = env
      ? "COLLECTOR_SEED_HEX inválida (se esperan 64 hex); se usa la semilla QRNG pública de la demo."
      : "Semilla QRNG pública de la demo: la clave NO es secreta. Configurar COLLECTOR_SEED_HEX en producción.";
  }
  seedHex = seedHex.toLowerCase();
  if (cached?.seedHex !== seedHex) {
    cached = { seedHex, value: { keyPair: generateKeyPair(hexToBytes(seedHex)), seed_origin, note } };
  }
  return cached.value;
}

export function getCollectorInfo(): CollectorInfo {
  const { keyPair, seed_origin, note } = getCollectorKey();
  return {
    alg: "ML-DSA-65",
    key_id: keyPair.keyId,
    public_key_b64: toBase64(keyPair.publicKey),
    stream_id: STREAM_ID,
    seed_origin,
    ...(note ? { note } : {}),
  };
}
