# Cadena de custodia post-cuántica para focos de incendio en Salta

Proyecto para ARG Space Hackathon. Toma detecciones de focos activos de **NASA FIRMS** (VIIRS, 375 m) para la provincia de Salta, las reproduce como un flujo de lotes y protege su integridad con **ML-DSA-65** (NIST FIPS 204), una firma digital post-cuántica que funciona en software convencional.

Anclaje local: el 14/06/2026 el Gobierno de Salta informó un incendio forestal en Cafayate con más de 50 ha de bosque nativo afectadas.

## Qué hace
- **Recolector**: agrupa detecciones en lotes, los encadena (`prev_hash`) y los firma con ML-DSA-65 sobre SHA3-256.
- **Verificador**: detecta alteración, duplicados (replay), pérdidas, reordenamientos, lotes firmados con claves ajenas y cadenas bifurcadas.
- **Mapa** en vivo con el estado de integridad de cada foco y un panel para inyectar ataques.
- **Capa cuántica (Qiskit, simulador Aer)**: QRNG simulado que genera la semilla de la clave del recolector, Shor N=15 (por qué caen RSA/ECDSA) y Grover (por qué SHA3-256/ML-DSA siguen en pie).

## Qué NO es
- No es QKD ni cifrado cuántico; no se usó hardware cuántico ni de IBM.
- La firma protege desde el recolector en adelante; **no prueba que NASA firmó el dato original**.
- FIRMS puede no detectar incendios (nubes, humo, dosel, fuegos entre pasadas); un punto caliente no es un perímetro. No es un sistema de despacho autónomo.

## Estructura
- `web/` — Next.js 16 + Motion + MapLibre. `npm install && npm run dev`, `npm test`, `npm run build`.
- `web/src/lib/pipeline/` — criptografía (Collector, Verifier, ataques, benchmark).
- `web/src/lib/firms.ts`, `web/src/app/api/firms/` — datos FIRMS (histórico + en vivo con `FIRMS_MAP_KEY` opcional).
- `quantum/` — scripts Qiskit (`uv venv --python 3.12 && uv pip install -r requirements.txt && .venv/bin/python run_all.py`).
- `DECISIONS.md`, `TODO.md`, `CONTRACTS.md`.
