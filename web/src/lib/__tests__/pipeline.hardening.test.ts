// Casos borde del pipeline: JSON canónico, máquina de estados del verificador y falsificaciones finas.
import { describe, it, expect } from "vitest";
import {
  ALG,
  Collector,
  GENESIS_HASH,
  MAX_SEQ_JUMP,
  SIZES,
  Verifier,
  applyAttack,
  batchLinkHash,
  bytesToHex,
  canonicalJSON,
  forgeWithSpoofedKeyId,
  fromBase64,
  fromBase64Strict,
  generateKeyPair,
  keyIdOf,
  runBenchmark,
  runBenchmarkAsync,
  sha3,
  signBytes,
  toBase64,
} from "../pipeline";
import type { BatchPayload, FireDetection, SignedBatch } from "../types";

const det = (i: number): FireDetection => ({
  id: `d${i}`, latitude: -26.07, longitude: -65.97, bright_ti4: 330, bright_ti5: 290, frp: 12,
  scan: 0.4, track: 0.4, acq_date: "2026-06-14", acq_time: "0510", satellite: "N", instrument: "VIIRS",
  confidence: "n", daynight: "N", source: "synthetic",
});

const kp = generateKeyPair(new Uint8Array(32).fill(7));
const mk = (n: number, streamId?: string) => {
  const c = new Collector({ keyPair: kp, streamId, now: () => new Date("2026-06-14T05:30:00Z") });
  return Array.from({ length: n }, (_, i) => c.makeBatch([det(i), det(i + 100)]));
};
const stream = mk(8);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const statuses = (s: SignedBatch[], v = new Verifier([kp.publicKey])) => s.map((b) => v.ingest(b).status);
/** Firma un payload arbitrario con la clave legítima (simula un recolector comprometido o con bug). */
const signAs = (payload: BatchPayload, secretKey = kp.secretKey): SignedBatch => {
  const digest = sha3(canonicalJSON(payload));
  return { payload, payload_hash: bytesToHex(digest), signature: toBase64(signBytes(digest, secretKey)), alg: ALG };
};

describe("canonicalJSON: casos borde", () => {
  it("no depende del orden de inserción, a ninguna profundidad", () => {
    const a = { z: 1, a: { y: [1, { q: 1, b: 2 }], x: null } };
    const b = { a: { x: null, y: [1, { b: 2, q: 1 }] }, z: 1 };
    expect(canonicalJSON(a)).toBe(canonicalJSON(b));
    expect(canonicalJSON(a)).toBe('{"a":{"x":null,"y":[1,{"b":2,"q":1}]},"z":1}');
  });
  it("es estable tras un viaje JSON.stringify → JSON.parse", () => {
    const v = {
      n: [0, -0, 1e21, 1e-7, 0.1 + 0.2, -12.5, 5e-324, Number.MAX_SAFE_INTEGER],
      s: 'comillas " barra \\ salto \n tab \t ñ é 🔥   \ud800',
      d: new Date("2026-06-14T05:30:00.000Z"),
      u: undefined,
      nested: { "": 1, "é": 2, e: 3, "éb": 4, Z: 5, a: 6, "10": 7, "9": 8 },
    };
    const round = JSON.parse(JSON.stringify(v));
    expect(canonicalJSON(v)).toBe(canonicalJSON(round));
    expect(JSON.parse(canonicalJSON(v))).toEqual(round);
  });
  it("omite propiedades undefined y serializa -0 como 0", () => {
    expect(canonicalJSON({ a: undefined, b: -0 })).toBe('{"b":0}');
  });
  it("ordena claves por unidades UTF-16 (no por orden numérico de inserción)", () => {
    expect(canonicalJSON({ "10": 1, "9": 2, b: 3, B: 4, "": 5 })).toBe('{"":5,"10":1,"9":2,"B":4,"b":3}');
  });
  it("respeta toJSON (Date) igual que JSON.stringify", () => {
    const d = new Date("2026-06-14T05:30:00.000Z");
    expect(canonicalJSON({ d })).toBe('{"d":"2026-06-14T05:30:00.000Z"}');
  });
  it("lanza con lo que JSON no puede representar sin pérdida", () => {
    expect(() => canonicalJSON({ x: NaN })).toThrow();
    expect(() => canonicalJSON({ x: Infinity })).toThrow();
    expect(() => canonicalJSON([1, undefined, 2])).toThrow();
    expect(() => canonicalJSON([1, , 2])).toThrow();
    expect(() => canonicalJSON({ x: BigInt(1) })).toThrow();
    expect(() => canonicalJSON({ x: () => 1 })).toThrow();
    expect(() => canonicalJSON({ x: Symbol("s") })).toThrow();
    expect(() => canonicalJSON({ x: new Map([[1, 2]]) })).toThrow();
    expect(() => canonicalJSON({ x: new Uint8Array(2) })).toThrow();
    expect(() => canonicalJSON(undefined)).toThrow();
  });
  it("lanza con estructuras cíclicas en vez de desbordar la pila", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => canonicalJSON(a)).toThrow(/profunda|cíclica/);
  });
  it("no confunde estructuras distintas (sin ambigüedad de concatenación)", () => {
    expect(canonicalJSON({ a: "1,2" })).not.toBe(canonicalJSON({ a: [1, 2] }));
    expect(canonicalJSON({ a: '","b":"' })).not.toBe(canonicalJSON({ a: "", b: "" }));
    expect(canonicalJSON([[], []])).not.toBe(canonicalJSON([[[]]]));
  });
  it("acepta claves __proto__ que llegan por JSON.parse sin perderlas", () => {
    const o = JSON.parse('{"__proto__":{"x":1},"a":1}');
    expect(canonicalJSON(o)).toBe('{"__proto__":{"x":1},"a":1}');
  });
});

describe("base64", () => {
  it("ida y vuelta, también con buffers grandes", () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 31) & 255);
    expect(fromBase64Strict(toBase64(big))).toEqual(big);
    expect(fromBase64(toBase64(new Uint8Array([0, 255, 128])))).toEqual(new Uint8Array([0, 255, 128]));
  });
  it("la variante estricta rechaza codificaciones no canónicas", () => {
    expect(() => fromBase64Strict("QUJD\n")).toThrow();
    expect(() => fromBase64Strict(" QUJD")).toThrow();
    expect(() => fromBase64Strict("QUI")).toThrow(); // sin relleno
    expect(() => fromBase64Strict("QUJ=")).toThrow(); // bits sobrantes: "QUI=" es la forma canónica
    expect(() => fromBase64Strict("QUJD-_")).toThrow(); // alfabeto url-safe
    expect(fromBase64Strict("QUI=")).toEqual(new Uint8Array([65, 66]));
  });
});

describe("Verifier: entradas hostiles", () => {
  it("nunca lanza con basura y la marca como alterada", () => {
    const v = new Verifier([kp.publicKey]);
    const junk: unknown[] = [
      null, undefined, 42, "x", {}, { payload: null }, { payload: {} },
      { payload: { key_id: 5 } },
      { ...clone(stream[0]), signature: 123 },
      { ...clone(stream[0]), payload: { ...clone(stream[0].payload), seq: "0" } },
      { ...clone(stream[0]), payload: { ...clone(stream[0].payload), seq: -1 } },
      { ...clone(stream[0]), payload: { ...clone(stream[0].payload), seq: 1.5 } },
      { ...clone(stream[0]), payload: { ...clone(stream[0].payload), detections: "no" } },
      { ...clone(stream[0]), payload: { ...clone(stream[0].payload), prev_hash: "zz" } },
    ];
    for (const j of junk) {
      const r = v.ingest(j as SignedBatch);
      expect(r.status).toBe("tampered");
    }
    // y el estado no se contaminó: el flujo legítimo sigue verificando limpio
    expect(statuses(stream, v).every((s) => s === "ok")).toBe(true);
  });
  it("rechaza un alg distinto de ML-DSA-65", () => {
    const b = { ...clone(stream[0]), alg: "none" } as unknown as SignedBatch;
    expect(new Verifier([kp.publicKey]).ingest(b).status).toBe("tampered");
  });
  it("sin claves confiables todo es unknown_key", () => {
    expect(statuses(stream, new Verifier([])).every((s) => s === "unknown_key")).toBe(true);
  });
});

describe("Verifier: falsificaciones", () => {
  it("key_id confiable + firma de otra clave → tampered (no basta con copiar el key_id)", () => {
    const fake = forgeWithSpoofedKeyId(stream[2]);
    expect(fake.payload.key_id).toBe(kp.keyId);
    expect(fake.payload.seq).toBe(2);
    const v = new Verifier([kp.publicKey]);
    statuses(stream.slice(0, 2), v);
    expect(v.ingest(fake).status).toBe("tampered");
    // el falso no ocupó el lugar del legítimo
    expect(v.ingest(stream[2]).status).toBe("ok");
  });
  it("lote legítimo al que se le cambia el key_id por otro (incluso confiable) → no pasa", () => {
    const other = generateKeyPair(new Uint8Array(32).fill(9));
    const v = new Verifier([kp.publicKey, other.publicKey]);
    const b = clone(stream[0]);
    b.payload.key_id = other.keyId;
    expect(v.ingest(b).status).toBe("tampered"); // el hash ya no coincide
    const b2 = signAs({ ...clone(stream[0].payload), key_id: other.keyId }); // firmado por kp, declara other
    expect(v.ingest(b2).status).toBe("tampered");
  });
  it("acepta varias claves confiables y distingue la ajena", () => {
    const other = generateKeyPair(new Uint8Array(32).fill(9));
    const b = new Collector({ keyPair: other, streamId: "otro" }).makeBatch([det(1)]);
    expect(new Verifier([kp.publicKey, other.publicKey], { streamId: "otro" }).ingest(b).status).toBe("ok");
    expect(new Verifier([kp.publicKey]).ingest(b).status).toBe("unknown_key");
    expect(keyIdOf(other.publicKey)).not.toBe(kp.keyId);
  });
  it("alterar CUALQUIER campo del payload o el hash declarado se detecta", () => {
    const mut: ((b: SignedBatch) => void)[] = [
      (b) => (b.payload.seq += 1),
      (b) => (b.payload.stream_id += "x"),
      (b) => (b.payload.created_at = "2026-06-15T00:00:00.000Z"),
      (b) => (b.payload.prev_hash = "f".repeat(64)),
      (b) => b.payload.detections.pop(),
      (b) => b.payload.detections.reverse(),
      (b) => (b.payload.detections[1].confidence = "h"),
      (b) => ((b.payload as unknown as Record<string, unknown>).extra = 1),
      (b) => (b.payload_hash = "0".repeat(64)),
      (b) => (b.payload_hash = b.payload_hash.toUpperCase()),
    ];
    for (const m of mut) {
      const b = clone(stream[0]);
      m(b);
      expect(new Verifier([kp.publicKey]).ingest(b).status).toBe("tampered");
    }
  });
});

describe("Verifier: maleabilidad de la firma", () => {
  const sigBytes = fromBase64(stream[0].signature);
  it("la firma tiene el tamaño FIPS 204 y cualquier bit cambiado la invalida", () => {
    expect(sigBytes.length).toBe(SIZES.signature);
    for (const pos of [0, 1, 31, 32, 1000, 2000, 3000, SIZES.signature - 2, SIZES.signature - 1]) {
      const s = sigBytes.slice();
      s[pos] ^= 1;
      const b = { ...clone(stream[0]), signature: toBase64(s) };
      expect(new Verifier([kp.publicKey]).ingest(b).status).toBe("tampered");
    }
  });
  it("rechaza firmas truncadas, extendidas o vacías", () => {
    for (const s of [sigBytes.slice(0, -1), new Uint8Array([...sigBytes, 0]), new Uint8Array(0)]) {
      const b = { ...clone(stream[0]), signature: toBase64(s) };
      expect(new Verifier([kp.publicKey]).ingest(b).status).toBe("tampered");
    }
  });
  it("rechaza re-codificaciones base64 equivalentes (evitan culpar al lote siguiente)", () => {
    const sig = stream[0].signature;
    for (const variant of [sig + "\n", " " + sig, sig.slice(0, 100) + "\n" + sig.slice(100)]) {
      expect(fromBase64(variant)).toEqual(sigBytes); // atob las considera la misma firma…
      const v = new Verifier([kp.publicKey]);
      expect(v.ingest({ ...clone(stream[0]), signature: variant }).status).toBe("tampered"); // …el verificador no
      expect(v.ingest(stream[0]).status).toBe("ok");
      expect(v.ingest(stream[1]).status).toBe("ok");
    }
  });
  it("una firma válida de otro lote no sirve (no es transplantable)", () => {
    const b = { ...clone(stream[1]), signature: stream[0].signature };
    expect(new Verifier([kp.publicKey]).ingest(b).status).toBe("tampered");
  });
  it("el context string separa dominios: firma sin contexto no verifica", async () => {
    const { ml_dsa65 } = await import("@noble/post-quantum/ml-dsa.js");
    const digest = sha3(canonicalJSON(stream[0].payload));
    const b = { ...clone(stream[0]), signature: toBase64(ml_dsa65.sign(digest, kp.secretKey)) };
    expect(new Verifier([kp.publicKey]).ingest(b).status).toBe("tampered");
  });
});

describe("Verifier: duplicados, reordenamientos, pérdidas y cadena", () => {
  it("replay tardío (no consecutivo) y replay múltiple → duplicate, sin perder nada", () => {
    const v = new Verifier([kp.publicKey]);
    const s = statuses([stream[0], stream[1], stream[2], stream[0], stream[3], stream[1], stream[1]], v);
    expect(s).toEqual(["ok", "ok", "ok", "duplicate", "ok", "duplicate", "duplicate"]);
    expect(v.finalize()).toEqual([]);
  });
  it("replay de un lote que antes llegó alterado NO es duplicado: el original se acepta", () => {
    const v = new Verifier([kp.publicKey]);
    const bad = applyAttack(stream, "tamper", 1)[1];
    expect(statuses([stream[0], bad, stream[1], stream[2]], v)).toEqual(["ok", "tampered", "ok", "ok"]);
  });
  it("reordenar dos lotes: gap + reordered, la cadena queda verificada y nada perdido", () => {
    const v = new Verifier([kp.publicKey]);
    const s = statuses(applyAttack(stream, "reorder", 2), v);
    expect(s).toEqual(["ok", "ok", "gap", "reordered", "ok", "ok", "ok", "ok"]);
    expect(v.missingSeqs).toEqual([]);
    expect(v.finalize()).toEqual([]);
  });
  it("reordenamiento largo (entrega en orden inverso) sin falsos broken_chain", () => {
    const v = new Verifier([kp.publicKey]);
    const s = statuses([...stream].reverse(), v);
    expect(s[0]).toBe("gap");
    expect(s.slice(1).every((x) => x === "reordered")).toBe(true);
    expect(v.finalize()).toEqual([]);
  });
  it("varias pérdidas separadas y un hueco múltiple", () => {
    const v = new Verifier([kp.publicKey]);
    const kept = stream.filter((b) => ![1, 4, 5].includes(b.payload.seq));
    const res = kept.map((b) => v.ingest(b));
    expect(res.map((r) => r.status)).toEqual(["ok", "gap", "ok", "gap", "ok"]);
    expect(res[1].missing_seqs).toEqual([1]);
    expect(res[3].missing_seqs).toEqual([4, 5]);
    expect(v.missingSeqs).toEqual([1, 4, 5]);
    expect(v.finalize().map((r) => r.seq)).toEqual([1, 4, 5]);
  });
  it("se pierde el primer lote", () => {
    const v = new Verifier([kp.publicKey]);
    expect(statuses(stream.slice(1, 3), v)).toEqual(["gap", "ok"]);
    expect(v.finalize().map((r) => r.seq)).toEqual([0]);
  });
  it("pérdida + reordenamiento combinados: sólo queda perdido el que nunca llegó", () => {
    const v = new Verifier([kp.publicKey]);
    // se pierde #2; #4 y #5 llegan intercambiados
    const s = statuses([stream[0], stream[1], stream[3], stream[5], stream[4], stream[6]], v);
    expect(s).toEqual(["ok", "ok", "gap", "gap", "reordered", "ok"]);
    expect(v.finalize().map((r) => r.seq)).toEqual([2]);
  });
  it("LÍMITE: la pérdida del último lote es indetectable sin conocer el total esperado", () => {
    const v = new Verifier([kp.publicKey]);
    expect(statuses(stream.slice(0, 6), v).every((s) => s === "ok")).toBe(true);
    expect(v.finalize()).toEqual([]); // nada delata que faltan #6 y #7
    expect(v.finalize(stream.length).map((r) => r.seq)).toEqual([6, 7]); // con el total, sí
    expect(v.finalize(6)).toEqual([]);
  });
  it("finalize(total) también cubre el flujo vacío y combina con huecos intermedios", () => {
    expect(new Verifier([kp.publicKey]).finalize(3).map((r) => r.seq)).toEqual([0, 1, 2]);
    const v = new Verifier([kp.publicKey]);
    statuses([stream[0], stream[2]], v);
    expect(v.finalize(5).map((r) => r.seq)).toEqual([1, 3, 4]);
  });
  it("génesis: el lote #0 debe encadenar al hash cero", () => {
    expect(stream[0].payload.prev_hash).toBe(GENESIS_HASH);
    const b = signAs({ ...clone(stream[0].payload), prev_hash: "a".repeat(64) });
    expect(new Verifier([kp.publicKey]).ingest(b).status).toBe("broken_chain");
  });
  it("cada prev_hash es el eslabón del lote anterior", () => {
    for (let i = 1; i < stream.length; i++) expect(stream[i].payload.prev_hash).toBe(batchLinkHash(stream[i - 1]));
  });
  it("bifurcación: dos lotes válidos distintos con el mismo seq → broken_chain, se conserva el primero", () => {
    const v = new Verifier([kp.publicKey]);
    statuses(stream.slice(0, 3), v);
    const twin = signAs({ ...clone(stream[2].payload), detections: [det(777)] });
    expect(v.ingest(twin).status).toBe("broken_chain");
    expect(v.ingest(stream[3]).status).toBe("ok"); // la cadena original sigue
  });
  it("cadena rota que se revela tarde: el lote faltante llega y no encaja con sus vecinos", () => {
    // Flujo A: #0, #1, #2. Flujo B (misma clave, otro contenido): su #1 no encadena con A#0 ni con A#2.
    const forkB = mk(3);
    const other = new Collector({ keyPair: kp, now: () => new Date("2026-06-14T06:00:00Z") });
    other.makeBatch([det(900)]);
    const b1 = other.makeBatch([det(901)]);
    const v = new Verifier([kp.publicKey]);
    expect(v.ingest(forkB[0]).status).toBe("ok");
    expect(v.ingest(forkB[2]).status).toBe("gap"); // aún no se puede comprobar su prev_hash
    expect(v.ingest(b1).status).toBe("broken_chain"); // llega "el #1", pero es de otra rama
    expect(v.missingSeqs).toEqual([]);
  });
  it("tras un hueco, el lote siguiente al hueco que NO encadena se detecta cuando llega el faltante", () => {
    const a = mk(3);
    const rogue2 = signAs({ ...clone(a[2].payload), prev_hash: "b".repeat(64) });
    const v = new Verifier([kp.publicKey]);
    expect(v.ingest(a[0]).status).toBe("ok");
    expect(v.ingest(rogue2).status).toBe("gap");
    expect(v.ingest(a[1]).status).toBe("broken_chain"); // a[1] es legítimo, pero su sucesor aceptado no lo referencia
  });
  it("un lote de otro stream firmado con la misma clave no entra en la cadena", () => {
    const otro = mk(3, "jujuy-firms-viirs");
    const v = new Verifier([kp.publicKey]);
    expect(v.ingest(stream[0]).status).toBe("ok");
    expect(v.streamId).toBe("salta-firms-viirs");
    expect(v.ingest(otro[1]).status).toBe("broken_chain"); // replay cruzado en el lugar del #1
    expect(v.ingest(stream[1]).status).toBe("ok");
    const pinned = new Verifier([kp.publicKey], { streamId: "salta-firms-viirs" });
    expect(pinned.ingest(otro[0]).status).toBe("broken_chain");
    expect(pinned.ingest(stream[0]).status).toBe("ok");
  });
  it("un seq absurdo (firmado) no hace marcar millones de faltantes", () => {
    const v = new Verifier([kp.publicKey]);
    v.ingest(stream[0]);
    const far = signAs({ ...clone(stream[1].payload), seq: MAX_SEQ_JUMP + 5 });
    expect(v.ingest(far).status).toBe("broken_chain");
    expect(v.missingSeqs).toEqual([]);
    expect(v.ingest(stream[1]).status).toBe("ok");
  });
  it("lote vacío (sin detecciones) se firma y verifica", () => {
    const c = new Collector({ keyPair: kp });
    expect(new Verifier([kp.publicKey]).ingest(c.makeBatch([])).status).toBe("ok");
  });
  it("el lote sobrevive a un viaje por JSON (SSE/HTTP) sin cambiar de hash", () => {
    const wire = stream.map((b) => JSON.parse(JSON.stringify(b)) as SignedBatch);
    expect(statuses(wire).every((s) => s === "ok")).toBe(true);
  });
  it("ataques sobre flujo vacío o índices fuera de rango no lanzan", () => {
    for (const k of ["tamper", "duplicate", "drop", "reorder", "forge"] as const) {
      expect(applyAttack([], k, 0)).toEqual([]);
      expect(() => applyAttack(stream, k, 999)).not.toThrow();
      expect(() => applyAttack(stream, k, -5)).not.toThrow();
    }
    expect(applyAttack(stream, "reorder", stream.length - 1).map((b) => b.payload.seq)).toEqual(stream.map((b) => b.payload.seq));
  });
  it("applyAttack no muta el flujo original", () => {
    const before = JSON.stringify(stream);
    applyAttack(stream, "tamper", 0);
    expect(JSON.stringify(stream)).toBe(before);
  });
});

describe("benchmark", () => {
  const sample = Array.from({ length: 30 }, (_, i) => det(i));
  it("síncrono y asíncrono devuelven métricas coherentes", async () => {
    const a = runBenchmark(3, sample, 5);
    let ticks = 0;
    const b = await runBenchmarkAsync(3, sample, 5, () => ticks++);
    expect(ticks).toBe(3);
    for (const r of [a, b]) {
      expect(r.batches).toBe(3);
      expect(r.sig_bytes).toBe(3309);
      expect(r.pk_bytes).toBe(1952);
      expect(r.sign_ms_avg).toBeGreaterThan(0);
      expect(r.verify_ms_avg).toBeGreaterThan(0);
      expect(Number.isFinite(r.batches_per_s)).toBe(true);
      expect(r.overhead_pct).toBeGreaterThan(0);
    }
  });
  it("rechaza n inválido y tolera muestra vacía", () => {
    expect(() => runBenchmark(0, sample)).toThrow();
    expect(Number.isFinite(runBenchmark(1, []).overhead_pct)).toBe(true);
  });
});

describe("total de la sesión firmado (total_batches): corte al final detectable", () => {
  const session = (n: number) => {
    const c = new Collector({ keyPair: kp, totalBatches: n, now: () => new Date("2026-06-14T05:30:00Z") });
    return Array.from({ length: n }, (_, i) => c.makeBatch([det(i)]));
  };
  it("sin total_batches el payload es idéntico al contrato anterior", () => {
    expect("total_batches" in stream[0].payload).toBe(false);
    expect(canonicalJSON(stream[0].payload)).not.toContain("total_batches");
  });
  it("flujo completo: ok y nada perdido", () => {
    const v = new Verifier([kp.publicKey]);
    expect(statuses(session(5), v).every((s) => s === "ok")).toBe(true);
    expect(v.declaredTotal).toBe(5);
    expect(v.finalize()).toEqual([]);
  });
  it("suprimir los últimos lotes queda registrado sin datos fuera de banda", () => {
    const v = new Verifier([kp.publicKey]);
    statuses(session(5).slice(0, 3), v);
    expect(v.finalize().map((r) => r.seq)).toEqual([3, 4]);
  });
  it("el total firmado manda sobre un expectedCount no autenticado (p. ej. `done.batches` reescrito)", () => {
    const v = new Verifier([kp.publicKey]);
    statuses(session(5).slice(0, 3), v);
    expect(v.finalize(3).map((r) => r.seq)).toEqual([3, 4]);
  });
  it("no se puede bajar el total alterando un lote: rompe la firma", () => {
    const b = clone(session(5)[0]);
    b.payload.total_batches = 1;
    expect(new Verifier([kp.publicKey]).ingest(b).status).toBe("tampered");
    const c = clone(session(5)[0]);
    delete c.payload.total_batches;
    expect(new Verifier([kp.publicKey]).ingest(c).status).toBe("tampered");
  });
  it("lotes firmados que contradicen el total o lo exceden → broken_chain", () => {
    const s5 = session(5);
    const v = new Verifier([kp.publicKey]);
    v.ingest(s5[0]);
    const otherTotal = signAs({ ...clone(s5[1].payload), total_batches: 9 });
    expect(v.ingest(otherTotal).status).toBe("broken_chain");
    const beyond = signAs({ ...clone(s5[1].payload), seq: 5 });
    expect(v.ingest(beyond).status).toBe("broken_chain");
    const noTotalBeyond = signAs({ ...clone(stream[1].payload), seq: 7 });
    expect(v.ingest(noTotalBeyond).status).toBe("broken_chain");
    expect(v.ingest(s5[1]).status).toBe("ok");
    expect(v.finalize().map((r) => r.seq)).toEqual([2, 3, 4]);
  });
  it("el recolector no emite más lotes que los declarados y valida el total", () => {
    const c = new Collector({ keyPair: kp, totalBatches: 1 });
    c.makeBatch([det(1)]);
    expect(() => c.makeBatch([det(2)])).toThrow();
    expect(() => new Collector({ keyPair: kp, totalBatches: 0 })).toThrow();
    expect(() => new Collector({ keyPair: kp, totalBatches: 1.5 })).toThrow();
  });
  it("total_batches mal formado → tampered", () => {
    const b = { ...clone(stream[0]), payload: { ...clone(stream[0].payload), total_batches: "5" } } as unknown as SignedBatch;
    expect(new Verifier([kp.publicKey]).ingest(b).status).toBe("tampered");
  });
});
