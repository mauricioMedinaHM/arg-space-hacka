import { describe, it, expect } from "vitest";
import { Collector, Verifier, generateKeyPair, applyAttack, canonicalJSON, SIZES } from "../pipeline";
import type { FireDetection, IntegrityStatus } from "../types";

const det = (i: number): FireDetection => ({
  id: `d${i}`, latitude: -26.07, longitude: -65.97, bright_ti4: 330, bright_ti5: 290, frp: 12,
  scan: 0.4, track: 0.4, acq_date: "2026-06-14", acq_time: "0510", satellite: "N", instrument: "VIIRS",
  confidence: "n", daynight: "N", source: "synthetic",
});

const kp = generateKeyPair(new Uint8Array(32).fill(7));
const collector = new Collector({ keyPair: kp, now: () => new Date("2026-06-14T05:30:00Z") });
const stream = Array.from({ length: 8 }, (_, i) => collector.makeBatch([det(i), det(i + 100)]));

function run(s = stream) {
  const v = new Verifier([kp.publicKey]);
  const statuses = s.map((b) => v.ingest(b).status);
  return { statuses, lost: v.finalize().map((r) => r.seq) };
}
const count = (xs: IntegrityStatus[], s: IntegrityStatus) => xs.filter((x) => x === s).length;

describe("canonicalJSON", () => {
  it("ordena claves y es estable", () => {
    expect(canonicalJSON({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });
});

describe("ML-DSA-65 pipeline", () => {
  it("tamaños FIPS 204", () => {
    expect(SIZES.publicKey).toBe(1952);
    expect(SIZES.signature).toBe(3309);
  });
  it("flujo íntegro → todo ok", () => {
    const r = run();
    expect(r.statuses.every((s) => s === "ok")).toBe(true);
    expect(r.lost).toEqual([]);
  });
  it("detecta alteración", () => {
    const r = run(applyAttack(stream, "tamper", 3));
    expect(r.statuses[3]).toBe("tampered");
  });
  it("detecta duplicado", () => {
    expect(count(run(applyAttack(stream, "duplicate", 2)).statuses, "duplicate")).toBe(1);
  });
  it("detecta pérdida", () => {
    const r = run(applyAttack(stream, "drop", 4));
    expect(r.statuses).toContain("gap");
    expect(r.lost).toEqual([4]);
  });
  it("detecta reordenamiento sin pérdida final", () => {
    const r = run(applyAttack(stream, "reorder", 5));
    expect(r.statuses).toContain("reordered");
    expect(r.lost).toEqual([]);
  });
  it("detecta clave falsa", () => {
    expect(run(applyAttack(stream, "forge", 1)).statuses).toContain("unknown_key");
  });
  it("detecta cadena rota (firma válida, prev_hash incorrecto)", () => {
    const other = new Collector({ keyPair: kp });
    const a = other.makeBatch([det(1)]);
    const fork = new Collector({ keyPair: kp });
    fork.makeBatch([det(999)]); // seq 0 distinto
    const b = fork.makeBatch([det(2)]); // seq 1 encadenado a otro génesis
    const v = new Verifier([kp.publicKey]);
    expect(v.ingest(a).status).toBe("ok");
    expect(v.ingest(b).status).toBe("broken_chain");
  });
});
