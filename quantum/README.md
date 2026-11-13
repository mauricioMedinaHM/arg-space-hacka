# Módulo cuántico: objetivos, tamaños y fases de implementación

Este módulo reúne tres demostraciones didácticas relacionadas con aleatoriedad, búsqueda y factorización: QRNG simulado, Grover y Shor. **Los tamaños de los circuitos se eligieron para que cada idea pueda observarse y verificarse en una computadora local; no representan una ejecución cuántica a escala ni hardware real.** La firma que protege los lotes de la aplicación sigue siendo ML-DSA-65 sobre SHA3-256.

## Respuesta breve: ¿por qué esos tamaños?

Un registro de `n` qubits puede representar `2^n` estados base. Por eso unos pocos qubits bastan para una demostración pequeña, mientras que representar directamente un espacio de `2^256` requeriría 256 qubits y no demostraría por sí solo una búsqueda útil.

| Algoritmo | Registro elegido | Qué representa | Motivo de la elección |
|---|---:|---|---|
| QRNG | 8 qubits | 256 resultados posibles; cada disparo entrega 8 bits medidos | Un byte por disparo facilita inspeccionar la distribución. Con 4096 disparos hay 16 observaciones esperadas por resultado para el chi-cuadrado, además de suficientes bits para extraer los 256 bits de la semilla de demostración. |
| Grover | 4 qubits | Un espacio de búsqueda de 16 elementos | Es lo bastante pequeño para ver cómo el oráculo y el difusor amplifican un objetivo y cómo excederse de iteraciones reduce la probabilidad. El óptimo teórico es 3 iteraciones. |
| Shor | 8 qubits de conteo + 4 de trabajo = 12 | Estimación de fase para el orden de 7 módulo 15 | Los 4 qubits de trabajo codifican residuos de 0 a 14. Los 8 de conteo dan `2^8 = 256`, por encima de `15² = 225`, una resolución de fase de estilo estándar para recuperar el período con fracciones continuas. Para este caso particular, como el orden es 4 y divide a una potencia de 2, menos qubits de conteo podrían bastar; 8 no es el mínimo absoluto. |

Estos números son decisiones didácticas y de resolución del ejemplo, no una recomendación universal de tamaño. En especial, los 4 qubits de Grover **no** modelan SHA3-256: el ejemplo usa un objetivo de 4 bits para mostrar el comportamiento del algoritmo. La extrapolación teórica para preimagen de SHA3-256 es aproximadamente `2^128` consultas cuánticas, no cuatro qubits.

## Fases incrementales

La implementación se construye de lo más verificable a lo más específico. Cada fase agrega una idea y una comprobación antes de conectar el resultado con la siguiente.

### Fase 0 — Fijar el alcance y las afirmaciones

1. Usar simuladores locales de Qiskit Aer para ejecutar y validar el flujo sin cuenta ni hardware cuántico; los resultados estadísticos pueden variar en cada ejecución.
2. Separar dos propósitos: el QRNG ilustra el flujo de una semilla; Grover y Shor explican modelos de amenaza contra problemas clásicos.
3. Mantener explícito que Aer usa simulación clásica y que la integridad del producto no depende de estos circuitos: la brindan las firmas post-cuánticas ML-DSA-65.

**Por qué empezar acá:** evita presentar una simulación como aleatoriedad cuántica física o como parte de la firma real del sistema.

### Fase 1 — QRNG simulado: medir y derivar una semilla de demostración

Archivo: `qrng.py` → `qrng.json`.

1. Se fijan 8 qubits. En cada disparo, Hadamard sobre todos los qubits crea una superposición uniforme ideal de los `2^8 = 256` bitstrings posibles.
2. Se miden los 8 qubits y se repite el circuito 4096 veces. Eso produce hasta `4096 × 8 = 32 768` bits crudos; bajo una distribución uniforme, el chi-cuadrado espera `4096 / 256 = 16` observaciones por bitstring.
3. Se toman los primeros 256 bits crudos y se expresan como 64 dígitos hexadecimales: 32 bytes para `seed_hex`, que alimenta la clave de demostración del recolector.
4. Se calculan la fracción de unos, la entropía de Shannon por bit y el chi-cuadrado con su p-valor. Son diagnósticos de esta muestra, no una certificación de aleatoriedad.
5. Opcionalmente se repite la simulación con un modelo de ruido local derivado de un backend falso. No hay consulta a IBM ni ejecución en hardware.

**Por qué 8 qubits y 4096 disparos:** 8 permite observar un byte completo por resultado y repartir una muestra manejable sobre 256 categorías. 4096 aporta, idealmente, 16 observaciones por categoría y excede ampliamente los 256 bits necesarios para la semilla. Ninguna de estas elecciones convierte el simulador en una fuente segura de entropía.

### Fase 2 — Grover: hacer visible la amplificación de amplitud

Archivo: `grover.py` → `grover.json`.

1. Se usan 4 qubits, que codifican `N = 2^4 = 16` candidatos, y se marca el objetivo de juguete `1011`.
2. Se aplican Hadamard para preparar una superposición uniforme de los 16 candidatos.
3. El oráculo cambia la fase del estado objetivo, sin medir ni revelar cuál es.
4. El difusor refleja las amplitudes alrededor de su media; la repetición oráculo + difusor concentra probabilidad en el objetivo.
5. Se simulan `k = 0..4` repeticiones para comparar frecuencias empíricas con `P(k) = sin²((2k + 1)θ)`, donde `θ = asin(1/√N)`. Para `N = 16`, la regla usada por el proyecto da `⌊π/4 · √N⌋ = 3`; se observa el aumento hasta el entorno del 96 % en `k = 3` y la caída al iterar de más.
6. El verificador recalcula la probabilidad teórica, compara la muestra con ella y comprueba que sobrepasar el óptimo empeora el resultado.

**Por qué solo 4 qubits:** el objetivo es hacer visible una curva completa en una simulación pequeña, incluida la sobre-rotación. No se construye un oráculo para SHA3-256. Grover da una aceleración cuadrática: buscar una preimagen de un hash de 256 bits seguiría costando del orden de `2^128` evaluaciones cuánticas ideales.

### Fase 3 — Shor: convertir estimación de fase en factores

Archivo: `shor.py` → `shor.json`.

1. Se elige `N = 15` y `a = 7`. La comprobación clásica inicial da `mcd(7, 15) = 1`, condición para buscar el orden multiplicativo de `a` módulo `N`.
2. El registro de trabajo tiene 4 qubits porque debe codificar los residuos de 0 a 14 (`2^4 = 16` estados disponibles). El circuito especializado implementa las multiplicaciones modulares controladas por potencias de 7 mediante permutaciones de qubits; no es una implementación genérica para cualquier `N`.
3. El registro de conteo tiene 8 qubits. La elección sigue la resolución habitual `Q = 2^t ≥ N²`: aquí `Q = 256 ≥ 225`. Las multiplicaciones controladas codifican potencias de 7, y la QFT inversa transforma la información del período en fases medibles.
4. Se convierten los bitstrings medidos a fases `y / 2^8`. `Fraction.limit_denominator(15)` produce candidatos racionales; se conserva el orden que satisface `7^r ≡ 1 (mod 15)`. El resultado es `r = 4`.
5. Como `r` es par y `7^(r/2) mod 15 = 4`, se calculan `mcd(4 − 1, 15) = 3` y `mcd(4 + 1, 15) = 5`.
6. Se comprueban el período y los factores clásicamente antes de publicarlos.

**Por qué 8 + 4 qubits:** 4 de trabajo alcanzan para representar valores módulo 15; 8 de conteo dan la resolución del método de estimación de fase usado. En este ejemplo favorable, el orden real `r = 4` produce fases exactas `0, 1/4, 1/2, 3/4`, por lo que un registro de conteo más corto también podría recuperarlas. Se mantienen 8 para ilustrar una elección estándar con resolución suficiente, no porque sea el mínimo de este caso.

**Límite importante:** `N = 15` es un ejemplo pedagógico con compuertas construidas específicamente para ese módulo. No simula romper RSA-2048 ni implica que el circuito escale de forma práctica; una computadora cuántica tolerante a fallos requeriría recursos muy superiores.

### Fase 4 — Verificar antes de publicar

1. `run_all.py` ejecuta los tres scripts y escribe `qrng.json`, `grover.json`, `shor.json` y `summary.json` en `web/public/quantum/`.
2. `verify_outputs.py` vuelve a calcular las métricas desde los JSON, comprueba fórmulas, períodos, factores y concordancia entre el resumen y cada salida.
3. Antes de una demo, ejecutar la verificación después de regenerar los datos. Las salidas pueden variar entre ejecuciones porque no se fija una semilla para el simulador.

```bash
cd quantum
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python run_all.py
.venv/bin/python verify_outputs.py
```

También se puede ejecutar un algoritmo por separado (`.venv/bin/python qrng.py`, `grover.py` o `shor.py`). `verify_outputs.py` usa solo la biblioteca estándar y termina con código 1 cuando algún control falla.

## Qué prueba cada algoritmo — y qué no

| Script | Aporta a la demostración | No permite concluir |
|---|---|---|
| `qrng.py` | Flujo ilustrativo de medición → bits → semilla y métricas descriptivas | Que Aer genera entropía cuántica real o que la semilla publicada sea secreta |
| `grover.py` | Amplificación de un único objetivo y ventaja cuadrática de búsqueda | Que SHA3-256 se rompa con el circuito de 4 qubits |
| `shor.py` | Estimación de orden para `N = 15`, de donde salen 3 y 5 | Que el ejemplo sea genérico, escalable o capaz de factorizar claves RSA actuales |
| `verify_outputs.py` | Coherencia aritmética y estructural de las salidas publicadas | La procedencia de NASA de los datos ni una prueba formal del simulador |

## Ejecución y entorno

- Todo corre en **simuladores locales** (`qiskit-aer`); no se usa hardware cuántico de IBM.
- Versiones probadas: Python 3.12, Qiskit 2.6.2, Qiskit Aer 0.18.2 y Qiskit IBM Runtime 0.52.1 (solo para backends falsos).
- `common.py` contiene utilidades compartidas para la ruta de salida, fecha y dibujo del circuito.
- Los esquemas de los JSON están documentados en `../CONTRACTS.md`; los campos se agregan de forma aditiva.

## Límites y honestidad técnica

- **No es QKD:** no existe canal cuántico ni distribución cuántica de claves. La integridad de los datos la aportan ML-DSA-65 (FIPS 204) y SHA3-256.
- **QRNG simulado:** Aer usa un PRNG clásico por debajo. En producción se necesitaría un QRNG certificado o el CSPRNG del sistema operativo, más un proceso adecuado de acondicionamiento de entropía.
- **Semilla pública:** `seed_hex` se sirve en la web y solo es válida para la demo; nunca debe usarse para una clave real.
- **Estadística descriptiva:** entropía cercana a 1 y un p-valor razonable no certifican aleatoriedad ni descartan todo sesgo.
- **Amenaza futura:** Shor amenaza RSA y criptografía de curva elíptica cuando exista hardware cuántico tolerante a fallos; Grover reduce cuadráticamente la búsqueda de preimágenes. Esto motiva migrar a criptografía post-cuántica, pero no convierte estas demostraciones en ataques prácticos.
