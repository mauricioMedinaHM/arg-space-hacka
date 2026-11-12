"use client";
// Tipos y carga de las salidas Qiskit (web/public/quantum/*.json). Ver CONTRACTS.md.
import { useEffect, useState } from "react";

export interface QrngData {
  generated_at: string;
  backend: string;
  shots: number;
  n_qubits: number;
  circuit_text: string;
  counts: Record<string, number>;
  seed_hex: string;
  entropy_bits_per_bit: number;
  chi_square: number;
  chi_square_dof?: number;
  p_value: number;
  ones_fraction?: number;
  total_random_bits?: number;
  seed_derivation?: string;
  noise_model?: unknown;
}

export interface GroverData {
  generated_at: string;
  backend: string;
  n_qubits: number;
  search_space?: number;
  shots?: number;
  target: string;
  circuit_text: string;
  iterations: { k: number; p_success: number; p_theory?: number; counts: Record<string, number> }[];
  optimal_k: number;
  classical_expected_queries: number;
  quantum_queries: number;
}

export interface ShorData {
  generated_at: string;
  backend: string;
  N: number;
  a: number;
  n_count: number;
  shots?: number;
  circuit_text: string;
  counts: Record<string, number>;
  measured_phases: {
    bitstring: string;
    phase: number;
    fraction: string;
    r_guess: number;
    count?: number;
    valid_period?: boolean;
  }[];
  period: number;
  factors: [number, number];
}

export interface SummaryData {
  qiskit_version: string;
  aer_version: string;
  notes?: string[];
}

export type Loadable<T> =
  | { status: "loading"; data: null }
  | { status: "ready"; data: T }
  | { status: "error"; data: null };

const cache = new Map<string, Promise<unknown>>();

type Json = Record<string, unknown>;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isCounts = (v: unknown): boolean =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((n) => isNum(n) && n >= 0);

/**
 * Validación mínima de forma por archivo. Los paneles hacen cuentas con estos campos
 * (Math.max sobre conteos, potencias, índices): un JSON incompleto o regenerado con otro esquema
 * debe caer en el estado "error" del panel, no romper el render de toda la página.
 */
const VALIDATORS: Record<string, (d: Json) => boolean> = {
  qrng: (d) =>
    isStr(d.seed_hex) &&
    /^[0-9a-f]{64}$/i.test(d.seed_hex) &&
    isCounts(d.counts) &&
    Object.keys(d.counts as object).length > 0 &&
    isNum(d.shots) &&
    isNum(d.n_qubits) &&
    d.n_qubits > 0 &&
    d.n_qubits <= 16 &&
    isNum(d.entropy_bits_per_bit) &&
    isNum(d.chi_square) &&
    isNum(d.p_value) &&
    isStr(d.circuit_text),
  grover: (d) =>
    isStr(d.target) &&
    isNum(d.n_qubits) &&
    isNum(d.optimal_k) &&
    isNum(d.classical_expected_queries) &&
    isNum(d.quantum_queries) &&
    isStr(d.circuit_text) &&
    Array.isArray(d.iterations) &&
    d.iterations.length > 0 &&
    d.iterations.every((it: Json) => it && isNum(it.k) && isNum(it.p_success) && it.p_success >= 0 && it.p_success <= 1),
  shor: (d) =>
    isNum(d.N) &&
    isNum(d.a) &&
    isNum(d.period) &&
    d.period > 0 &&
    d.period <= 64 &&
    isCounts(d.counts) &&
    isStr(d.circuit_text) &&
    Array.isArray(d.factors) &&
    d.factors.length === 2 &&
    d.factors.every(isNum) &&
    Array.isArray(d.measured_phases) &&
    d.measured_phases.length > 0 &&
    d.measured_phases.every((m: Json) => m && isStr(m.bitstring) && isNum(m.phase) && isStr(m.fraction) && isNum(m.r_guess)),
  summary: (d) => isStr(d.qiskit_version) && isStr(d.aer_version),
};

export function validateQuantum(name: string, data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const v = VALIDATORS[name];
  try {
    return v ? v(data as Json) : true;
  } catch {
    return false;
  }
}

export function fetchQuantum<T>(name: string): Promise<T> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(`/quantum/${name}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (!validateQuantum(name, data)) throw new Error(`/quantum/${name}.json no tiene la forma esperada`);
        return data;
      });
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p as Promise<T>;
}

export function useQuantum<T>(name: string): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: "loading", data: null });
  useEffect(() => {
    let alive = true;
    fetchQuantum<T>(name).then(
      (data) => alive && setState({ status: "ready", data }),
      () => alive && setState({ status: "error", data: null }),
    );
    return () => {
      alive = false;
    };
  }, [name]);
  return state;
}
