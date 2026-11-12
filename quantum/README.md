# Módulo cuántico (Qiskit + Aer)

Parte cuántica de **"Integridad post-cuántica para datos de incendios en Salta (NASA FIRMS)"**.
Todo corre en **simuladores locales** (`qiskit-aer`). No se usa hardware real de IBM Quantum.

## Cómo ejecutar

```bash
cd quantum
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python run_all.py        # escribe los 4 JSON en ../web/public/quantum/
.venv/bin/python verify_outputs.py  # recalcula χ², entropía, Grover y Shor desde los JSON (sin Qiskit)
```

`verify_outputs.py` solo usa la biblioteca estándar: sirve como prueba de regresión de lo que la web
afirma (p. ej. que el p-valor sale de los conteos publicados, que 4 es el orden de 7 mod 15 y que el
óptimo de Grover coincide con ⌊π/4·√N⌋). Sale con código 1 si algo no cierra.

Cada script también se puede correr por separado (`.venv/bin/python qrng.py`, `grover.py`, `shor.py`)
y escribe solo su JSON. Los resultados cambian en cada corrida (no se fija semilla del simulador).

Versiones probadas: Python 3.12, qiskit 2.6.2, qiskit-aer 0.18.2, qiskit-ibm-runtime 0.52.1 (solo por los backends falsos).

## Qué muestra cada script

| Script | Salida | Qué demuestra |
|---|---|---|
| `qrng.py` | `qrng.json` | QRNG simulado: Hadamard sobre 8 qubits + medición, 4096 disparos (32 768 bits). Los primeros 256 bits crudos forman `seed_hex` (32 bytes), la semilla del par de claves **ML-DSA-65** del recolector. Incluye entropía de Shannon por bit, chi-cuadrado de uniformidad sobre los 256 resultados y p-valor. En `noise_model` se repite el experimento con el modelo de ruido de `FakeSherbrooke`. |
| `grover.py` | `grover.json` | Búsqueda de Grover en 4 qubits (16 elementos) del objetivo `1011`, como preimagen de un hash de juguete de 4 bits. Se corre con k = 0..4 iteraciones: el éxito sube hasta ~96 % en k = 3 y luego baja. Clásico: ~N/2 = 8 consultas en promedio (exacto: (N+1)/2 = 8,5); cuántico: ~π/4·√N ≈ 3,14. La ventaja es **solo cuadrática**, así que SHA3-256 sigue siendo seguro (~2^128). |
| `shor.py` | `shor.json` | Búsqueda de orden de Shor para N = 15, a = 7, con 8 qubits de conteo + 4 de trabajo (multiplicación modular controlada + QFT inversa). Las fases medidas (0, 1/4, 1/2, 3/4) se convierten con `Fraction.limit_denominator(15)`; se obtiene el período r = 4 y los factores 3 × 5. Ilustra por qué RSA/ECC caen ante un computador cuántico y por qué se firma con ML-DSA. |
| `run_all.py` | `summary.json` | Ejecuta todo, valida los JSON y guarda versiones, lista de scripts y notas. |

`common.py` tiene utilidades compartidas (ruta de salida, fecha, dibujo del circuito).
Los esquemas de los JSON están en `../CONTRACTS.md` (se agregan campos extra, nunca se quitan).

## Notas de honestidad

- **Es simulación.** No se ejecutó nada en hardware de IBM. El "ruido" viene de un backend falso
  (`qiskit_ibm_runtime.fake_provider`): una calibración guardada en el paquete, sin conexión ni cuenta de IBM.
- **No es QKD.** No hay canal cuántico ni distribución cuántica de claves. La integridad de los datos
  la dan las firmas post-cuánticas ML-DSA-65 (FIPS 204) sobre hashes SHA3-256; lo cuántico acá es
  (1) el origen didáctico de la semilla y (2) la justificación de la amenaza.
- **El QRNG simulado es pseudoaleatorio.** Aer usa un PRNG clásico por debajo. Es una demostración
  del flujo QRNG → semilla → clave. En producción se usaría un QRNG de hardware certificado o el
  CSPRNG del sistema operativo, y no se aplicaría la semilla cruda sin un extractor/condicionador.
- **La semilla es pública.** `seed_hex` queda en un JSON servido por la web: sirve para la demo,
  nunca para una clave real.
- **Shor con N = 15 es un juguete.** El circuito usa conocimiento previo de la estructura de 15
  (multiplicación modular por permutaciones). Romper RSA-2048 exige millones de qubits físicos con
  corrección de errores que hoy no existen; la migración se hace ahora por el riesgo a futuro.
- **Las pruebas estadísticas no certifican aleatoriedad.** Entropía ≈ 1 y un p-valor razonable solo
  indican que no se detecta sesgo en esta muestra.
