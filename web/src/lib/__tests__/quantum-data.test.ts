// Los JSON publicados por quantum/run_all.py deben pasar la validación de forma que usa la UI,
// y lo que la página afirma sobre ellos tiene que salir de los propios datos.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateQuantum } from "../quantum";
import { generateKeyPair, hexToBytes } from "../pipeline";

const load = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "public", "quantum", `${name}.json`), "utf8"));

describe("salidas Qiskit publicadas", () => {
  for (const name of ["qrng", "grover", "shor", "summary"]) {
    it(`${name}.json tiene la forma que espera la UI`, () => {
      expect(validateQuantum(name, load(name))).toBe(true);
    });
  }
  it("rechaza JSON incompletos o de otro tipo sin lanzar", () => {
    expect(validateQuantum("qrng", null)).toBe(false);
    expect(validateQuantum("qrng", [])).toBe(false);
    expect(validateQuantum("qrng", { ...load("qrng"), seed_hex: "abc" })).toBe(false);
    expect(validateQuantum("qrng", { ...load("qrng"), counts: { "0": "x" } })).toBe(false);
    expect(validateQuantum("grover", { ...load("grover"), iterations: [] })).toBe(false);
    expect(validateQuantum("grover", { ...load("grover"), iterations: [null] })).toBe(false);
    expect(validateQuantum("shor", { ...load("shor"), factors: [3] })).toBe(false);
    expect(validateQuantum("shor", { ...load("shor"), period: 1e9 })).toBe(false);
  });
  it("QRNG: χ² y entropía publicados salen de los conteos; la semilla sirve como semilla ML-DSA", () => {
    const q = load("qrng");
    const k = 2 ** q.n_qubits;
    const expected = q.shots / k;
    let chi2 = 0;
    let ones = 0;
    for (let i = 0; i < k; i++) {
      const key = i.toString(2).padStart(q.n_qubits, "0");
      const c = q.counts[key] ?? 0;
      chi2 += (c - expected) ** 2 / expected;
      ones += c * [...key].filter((b) => b === "1").length;
    }
    expect(chi2).toBeCloseTo(q.chi_square, 3);
    const p1 = ones / (q.shots * q.n_qubits);
    expect(-(p1 * Math.log2(p1) + (1 - p1) * Math.log2(1 - p1))).toBeCloseTo(q.entropy_bits_per_bit, 5);
    const kp = generateKeyPair(hexToBytes(q.seed_hex));
    expect(kp.publicKey.length).toBe(1952);
    expect(kp.keyId).toMatch(/^[0-9a-f]{32}$/);
  });
  it("Grover: teoría sin²((2k+1)θ), óptimo ⌊π/4·√N⌋ y caída al pasarse", () => {
    const g = load("grover");
    const N = 2 ** g.n_qubits;
    const theta = Math.asin(1 / Math.sqrt(N));
    for (const it of g.iterations) {
      const theory = Math.sin((2 * it.k + 1) * theta) ** 2;
      expect(it.p_theory).toBeCloseTo(theory, 5);
      expect(Math.abs(it.p_success - theory)).toBeLessThan(0.05);
    }
    expect(g.optimal_k).toBe(Math.floor((Math.PI / 4) * Math.sqrt(N)));
    expect(g.quantum_queries).toBeCloseTo((Math.PI / 4) * Math.sqrt(N), 3);
    const at = (k: number) => g.iterations.find((i: { k: number }) => i.k === k).p_success;
    expect(at(g.optimal_k + 1)).toBeLessThan(at(g.optimal_k));
  });
  it("Shor: el período es el orden de a mod N y da los factores", () => {
    const s = load("shor");
    const powmod = (b: number, e: number, m: number) => {
      let r = 1;
      for (let i = 0; i < e; i++) r = (r * b) % m;
      return r;
    };
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    expect(powmod(s.a, s.period, s.N)).toBe(1);
    for (let k = 1; k < s.period; k++) expect(powmod(s.a, k, s.N)).not.toBe(1);
    const half = s.a ** (s.period / 2);
    expect([gcd(half - 1, s.N), gcd(half + 1, s.N)].sort()).toEqual([...s.factors].sort());
    expect(s.factors[0] * s.factors[1]).toBe(s.N);
    for (const m of s.measured_phases) {
      expect(m.phase).toBe(parseInt(m.bitstring, 2) / 2 ** s.n_count);
      const [num, den] = m.fraction.split("/").map(Number);
      expect(num / den).toBeCloseTo(m.phase, 9);
      expect(m.r_guess).toBe(den);
      expect(m.valid_period).toBe(powmod(s.a, den, s.N) === 1);
    }
  });
});
