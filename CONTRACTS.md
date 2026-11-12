# Contratos entre módulos

## Tipos TS
`web/src/lib/types.ts` — FireDetection, BatchPayload, SignedBatch, VerificationResult, AttackKind.

## Datos
- `web/src/data/firms-salta.json` → `FireDetection[]` (histórico/sintético Salta, incluye escenario Cafayate jun-2026).

## Pipeline (web/src/lib/pipeline/)
- `canonical.ts`  → `canonicalJSON(obj): string`, `sha3hex(bytes|string): string`
- `keys.ts`       → `generateKeyPair(seed?: Uint8Array)`, `keyIdOf(publicKey)`
- `collector.ts`  → `class Collector { constructor(opts); makeBatch(dets): SignedBatch }`
- `verifier.ts`   → `class Verifier { constructor(trustedPublicKeys); ingest(b: SignedBatch): VerificationResult; finalize(): VerificationResult[] }`
- `attacks.ts`    → `applyAttack(stream: SignedBatch[], kind: AttackKind, index: number): SignedBatch[]`
- `bench.ts`      → `runBenchmark(n): {keygen_ms, sign_ms_avg, verify_ms_avg, batches_per_s, sig_bytes, pk_bytes}`
- `index.ts`      → re-export de todo.

## Cuántico (Qiskit, simulador Aer — sin hardware IBM real)
Scripts en `quantum/`, salidas en `web/public/quantum/`:
- `qrng.json`   : { generated_at, backend, shots, n_qubits, circuit_text, counts:{bitstring:n}, seed_hex (64 hex = 32 bytes), entropy_bits_per_bit, chi_square, p_value, noise_model? }
- `grover.json` : { generated_at, backend, n_qubits, target, circuit_text, iterations:[{k, p_success, counts}], optimal_k, classical_expected_queries, quantum_queries }
- `shor.json`   : { generated_at, backend, N, a, n_count, circuit_text, counts, measured_phases:[{bitstring, phase, fraction, r_guess}], period, factors:[p,q] }
- `summary.json`: { qiskit_version, aer_version, scripts, notes }
El seed de `qrng.json` se usa como semilla de la clave ML-DSA del recolector de la demo.
