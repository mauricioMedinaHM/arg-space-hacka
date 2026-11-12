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

export function fetchQuantum<T>(name: string): Promise<T> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(`/quantum/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
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
