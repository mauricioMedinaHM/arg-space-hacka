import { sha3_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

const MAX_DEPTH = 64;

/**
 * JSON canónico: claves ordenadas (por unidades UTF-16, como RFC 8785), sin espacios.
 * Determinístico entre emisor y verificador: el resultado es idéntico antes y después de un
 * viaje `JSON.stringify` → `JSON.parse`. Por eso:
 * - `undefined` en una propiedad se omite (igual que JSON.stringify);
 * - un objeto con `toJSON` (p. ej. Date) se serializa por su `toJSON()`;
 * - lo que JSON no puede representar sin pérdida lanza: números no finitos, bigint, funciones,
 *   símbolos, `undefined` dentro de un arreglo, Map/Set/TypedArray y estructuras cíclicas o
 *   demasiado profundas. Es preferible fallar al firmar que firmar algo distinto de lo que viaja.
 */
export function canonicalJSON(value: unknown): string {
  return canon(value, 0);
}

function canon(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH) throw new Error("canonicalJSON: estructura demasiado profunda o cíclica");
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new Error("canonicalJSON: número no finito");
      return JSON.stringify(value); // -0 → "0", igual que al viajar por JSON
    case "object":
      break;
    default:
      // undefined, bigint, function, symbol
      throw new Error(`canonicalJSON: tipo no serializable (${typeof value})`);
  }
  const maybe = value as { toJSON?: unknown };
  if (typeof maybe.toJSON === "function") return canon((maybe.toJSON as () => unknown).call(value), depth + 1);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    // for clásico: los huecos de arreglos dispersos se ven como undefined y lanzan
    for (let i = 0; i < value.length; i++) parts.push(canon(value[i], depth + 1));
    return `[${parts.join(",")}]`;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error("canonicalJSON: sólo se admiten objetos planos y arreglos");
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(obj[k], depth + 1)}`).join(",")}}`;
}

export function sha3(data: Uint8Array | string): Uint8Array {
  return sha3_256(typeof data === "string" ? utf8ToBytes(data) : data);
}

export function sha3hex(data: Uint8Array | string): string {
  return bytesToHex(sha3(data));
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

/** Decodifica base64 (tolerante, como `atob`). Para datos firmados usar `fromBase64Strict`. */
export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Decodifica base64 exigiendo la codificación canónica (alfabeto estándar, con relleno, sin
 * espacios ni bits sobrantes). `atob` acepta variantes equivalentes de una misma firma; como
 * `prev_hash` se calcula sobre el texto de la firma, aceptar variantes permitiría re-codificar un
 * lote válido y hacer que el lote legítimo siguiente parezca una cadena rota.
 */
export function fromBase64Strict(b64: string): Uint8Array {
  if (typeof b64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) {
    throw new Error("base64 no canónico");
  }
  const out = fromBase64(b64);
  if (toBase64(out) !== b64) throw new Error("base64 no canónico");
  return out;
}

export { bytesToHex, utf8ToBytes };
export { hexToBytes } from "@noble/hashes/utils.js";
