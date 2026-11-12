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

## Tiempo real (v2)
Todas las rutas nunca devuelven 500: degradan a fallback con `{ degraded: true, note }`.

- `GET /api/firms?days=1..5` (existente, mejorado): con FIRMS_MAP_KEY consulta en paralelo VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT, VIIRS_SNPP_NRT, MODIS_NRT.
- `GET /api/collector` → `{ alg:"ML-DSA-65", key_id, public_key_b64, stream_id, seed_origin: "env"|"qrng-demo" }`
  Clave del recolector del SERVIDOR: semilla de env `COLLECTOR_SEED_HEX` (64 hex); fallback a `seed_hex` de `public/quantum/qrng.json` (demo, pública).
- `GET /api/stream?batch=5` → `text/event-stream` (SSE). El servidor trae FIRMS en vivo, arma lotes y los FIRMA (Collector del servidor).
  Eventos:
  - `event: hello`  data: `{ key_id, public_key_b64, stream_id, source, origin, fetched_at, total_detections, total_batches }`
  - `event: batch`  data: `SignedBatch` (contrato types.ts) — ritmo ~1 lote cada 700 ms
  - `event: done`   data: `{ batches, next_poll_s }`
  - `event: error`  data: `{ message }`
  - comentarios `: ping` cada 15 s. El stream se cierra tras `done` (el cliente reabre cada `next_poll_s`).
  El VERIFICADOR corre en el navegador con la clave pública de `/api/collector` → separación real emisor/consumidor.
- `GET /api/weather` → `{ fetched_at, source:"open-meteo", points: [{ name, lat, lon, temperature_c, humidity_pct, wind_kmh, wind_dir_deg, gusts_kmh, precipitation_mm, fire_risk: "bajo"|"moderado"|"alto"|"muy alto"|"extremo", risk_score }] }`
  Puntos: Cafayate, Salta capital, Orán, Tartagal, J. V. González (Anta), Rosario de la Frontera. Riesgo: índice simple documentado (T, HR, viento, días sin lluvia) — "indicativo, no oficial".
- `GET /api/passes?hours=24` → `{ computed_at, tle_source, observer:{lat,lon,name:"Salta"}, passes:[{ satellite:"NOAA-20"|"NOAA-21"|"Suomi NPP"|"Aqua"|"Terra", instrument, start_utc, max_utc, end_utc, max_elevation_deg }] }`
  TLE de CelesTrak (cacheado), propagación con `satellite.js`. Fallback: TLE embebidos con fecha.

### Cambios v2.1 (post-auditoría)
- `hello`: `{ key_id, public_key_b64, stream_id: "salta-firms-live:<cycle_id>", stream_base: "salta-firms-live", cycle_id, source, origin, fetched_at, total_detections, total_batches, batch_size, seed_origin, degraded?, note? }`.
  El `stream_id` completo va FIRMADO en cada payload → el verificador se fija con `hello.stream_id`; lotes de otro ciclo dan `broken_chain` (anti-replay). `cycle_id` es ordenable: rechazar ciclos más viejos que el último aceptado.
- Cada payload lleva `total_batches` firmado → `verifier.finalize()` detecta truncamiento final. `done.batches` es informativo.
- `?batch=` ∈ {5,10,25,50}. Lotes firmados una vez por ciclo y reutilizados entre conexiones.
- `/api/passes`: cada pasada incluye `in_swath` (elevación máx. ≥20° VIIRS / ≥24.5° MODIS).
- `/api/weather`: puede incluir `missing_points`.
- `loadHistorical()` vive en `web/src/lib/firms-historical.ts` (carga diferida en el cliente).
