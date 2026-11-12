
## Cuántico

- Entorno: `quantum/.venv` con `uv` y Python 3.12 (el 3.14 del sistema se evitó por compatibilidad de wheels). qiskit 2.6.2, qiskit-aer 0.18.2, qiskit-ibm-runtime 0.52.1 (solo para backends falsos; nunca se conecta a IBM).
- Todo corre en `AerSimulator` local. Sin hardware IBM. No es QKD: la integridad la da ML-DSA-65 + SHA3-256.
- QRNG: 8 qubits, 4096 disparos, `memory=True`. `seed_hex` = primeros 256 bits crudos en orden de disparo, sin post-procesado. Chi-cuadrado sobre los 256 resultados (255 g.l.), p-valor con scipy. Se eligió 4096 disparos para tener 16 esperados por celda.
- `noise_model` en `qrng.json`: mismo circuito con `AerSimulator.from_backend(FakeSherbrooke())`; trae su propio `seed_hex`, que NO se usa para la clave (la clave usa el `seed_hex` de nivel superior).
- No se fija `seed_simulator`: cada `run_all.py` genera una semilla distinta, por lo que cambia la clave ML-DSA de la demo al regenerar.
- Grover: objetivo `1011` (orden de bits de Qiskit, qubit 0 a la derecha), k = 0..4, 4096 disparos. `optimal_k` es el empírico (coincide con el teórico 3); `quantum_queries` = π/4·√16 ≈ 3,1416 (float), `classical_expected_queries` = 8.
- Shor: N=15, a=7, n_count=8, construcción de libro de texto (SWAP/X controlados + QFT inversa manual). `period` = menor r_guess que cumple a^r ≡ 1 (mod N); las fases 0 y 1/2 dan r_guess 1 y 2 (no válidos) y quedan marcadas con `valid_period: false`.
- `circuit_text` se genera sin plegado (`fold=-1`); el de Shor mide ~170 columnas, mostrar en `<pre>` con scroll horizontal.
- Los JSON agregan campos extra a los de `CONTRACTS.md` (p. ej. `p_theory`, `simulated`, `highlights`), sin quitar ninguno.

## Datos
- **Snapshot real + sintético etiquetado.** `web/src/data/firms-salta.json` mezcla detecciones reales de NASA FIRMS (VIIRS C2 NRT, CSV públicos de 7 días, descargadas el 2026-11-12, `source: "historical"`) con un escenario sintético (`source: "synthetic"`). Nunca se presenta lo sintético como observación real; el detalle está en `firms-salta.meta.json`.
- **Tope de 400 detecciones reales.** El bbox tenía 1084 focos reales en 7 días (NOAA-20: 529, NOAA-21: 555); se conservan 400 por muestreo determinista con semilla para mantener el JSON chico (~195 KB) y el total en el rango 300-600.
- **S-NPP sin datos.** El CSV público de Suomi-NPP venía solo con encabezado (7d y 24h) al momento de la descarga; el snapshot real contiene solo N20 y N21. Por eso la ruta sin clave consulta los tres satélites y combina lo que responda.
- **Escenario Cafayate (12→16 jun 2026) sintético.** No hay archivo público sin clave para esa fecha, así que se reconstruye: ~100 detecciones alrededor de -26.07, -65.97, ignición el 12 por la tarde, pico el 14, control el 16; frente desplazándose al NE; pasadas ~04:40-06:20 y ~17:00-18:40 UTC de N/N20/N21; ti4 300-367 K, FRP 1-60 MW (log-normal); algunas pasadas "ciegas" simulando humo/nubes. Más 34 quemas agrícolas dispersas en Tartagal/Orán/Anta. PRNG mulberry32 con semilla fija → salida reproducible byte a byte.
- **Bbox rectangular** (lat -26.5..-22.0, lon -68.6..-62.3), no el polígono provincial: incluye porciones de provincias y países vecinos. Simple y suficiente para la demo; documentado en el meta.
- **Parser por nombre de columna.** Los CSV públicos de FIRMS no traen `instrument` y usan `nominal/low/high`; el área API trae `instrument` y `n/l/h`; MODIS usa `brightness/bright_t31` y confianza 0-100 (se mapea <30 l, 30-79 n, >=80 h; brightness→bright_ti4, bright_t31→bright_ti5). `parseFirmsCsv` cubre las tres variantes y descarta filas corruptas sin lanzar.
- **`/api/firms` con tres niveles de fallback** (área API con `FIRMS_MAP_KEY` → CSV públicos 24 h → snapshot local), timeout de 8 s por request, nunca 500. Con Cache Components (Next 16) el caché va en funciones auxiliares con `"use cache"` + `cacheLife` (revalidación 10 min); los errores se lanzan dentro de esas funciones para que no queden cacheados. El `fetch` usa `no-store` porque los CSV públicos (~800 KB c/u) se filtran antes de cachear.
- **El script generador duplica el parser en JS** (`web/scripts/build-firms-dataset.mjs`, sin dependencias) para poder correrlo con `node` a secas, sin paso de compilación TS.

## Pipeline criptográfico
- **ML-DSA-65** (FIPS 204, nivel 3) vía `@noble/post-quantum` (JS puro, auditado, corre en navegador y Node). Se eligió 65 sobre 44 por margen de seguridad y sobre 87 por tamaño de firma (3309 B).
- Se firma `SHA3-256(canonicalJSON(payload))` con context string FIPS 204 `salta-firms-integrity/v1` (separación de dominio).
- Encadenamiento: `prev_hash = SHA3-256(payload_hash:signature)` del lote anterior → detecta bifurcaciones.
- El verificador clasifica: ok, tampered, unknown_key, duplicate, gap, reordered, broken_chain. Un lote alterado no cuenta como recibido (por eso el siguiente marca `gap`).
- La clave del recolector de la demo se deriva de la semilla QRNG simulada (`public/quantum/qrng.json`). **Es pública a propósito**: es una demo; en producción la clave secreta viviría en un HSM/KMS y nunca en el cliente.
- La firma y verificación corren en el navegador para que la demo sea autónoma (sin backend ni red).
- Qiskit corre offline (no en Vercel: qiskit-aer supera los límites de tamaño de funciones serverless); los resultados se publican como JSON estáticos.
