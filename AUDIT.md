# Auditoría — Cadena de custodia post-cuántica (Salta / NASA FIRMS)

Fecha: 2026-11-12. Alcance: `web/` (Next.js 16.4.6) y `quantum/` (Qiskit Aer).
No se desplegó ni se hizo commit. Los archivos de los workers A (backend) y B (tiempo real) se auditaron en solo lectura; sus hallazgos quedan como pendientes.

Estado final verificado: `npm test` 143/143 (11 archivos), `npm run lint` sin errores, `npm run build` correcto, `quantum/verify_outputs.py` 0 fallas.

Severidad: **crítica / alta / media / baja**. Estado: **corregido**, **pendiente-para-worker-A**, **pendiente-para-worker-B**, **pendiente** (sin dueño claro).

## 1. Métricas medidas

Chromium headless (Playwright), `next start` local en el puerto 3313 contra el sitio desplegado (versión anterior). "Móvil" = 390×844 con CPU ×4. La máquina estaba cargada por otros builds, así que los TBT son orientativos.

| Métrica | Desplegado (antes) | Local (después) |
|---|---|---|
| LCP escritorio | 1464 ms | 60–100 ms |
| LCP móvil | 1912 ms | 120–240 ms |
| FCP escritorio / móvil | 356 / 468 ms | 60 / 120 ms (sin red) |
| CLS | 0 | 0,00 al cargar; 0,019 tras recorrer la página |
| TBT al cargar, escritorio / móvil | 0 / 360 ms | 0 / 100–650 ms |
| TBT tras recorrer la página | 678 / 538 ms | 0–1900 ms escritorio; 450–3900 ms móvil (muy variable) |
| Errores de consola | 0 | 0 |
| Violaciones de CSP | no había CSP | 0 (mapa, teselas y worker funcionan) |
| Benchmark (50 lotes) | congelaba ~1 s | 842–867 ms, 0 tareas largas |

- El LCP es comparable solo en parte: el desplegado incluye red (TTFB ~200 ms). La mejora real viene de que el `<h1>` ya no sale del servidor con `opacity:0` (ver P-1).
- El TBT alto tras recorrer la página aparece con el monitor en vivo de B: la verificación ML-DSA de cada lote SSE corre en el hilo principal (ver B-9). En una corrida sin carga dio 0 ms en escritorio.
- Único aviso de consola: `Image "circle-11" could not be loaded` (ícono que falta en el sprite de OpenFreeMap). Es inocuo.

Bundle del cliente (build final):

| Recurso | Tamaño | gzip |
|---|---|---|
| JS + CSS inicial | 1,11 MB | 308 KB |
| de eso, `firms-salta.json` (chunk propio) | 161 KB | 16,8 KB |
| MapLibre (lazy) | 1,08 MB | 295 KB |
| Worker de MapLibre (`public/maplibre`) | 520 KB | — |
| HTML | 101 KB | 17,6 KB |

MapLibre ya es lazy (`next/dynamic`, `ssr:false`), pero se monta al cargar aunque esté fuera de pantalla (B-8). El snapshot de 195 KB sí llega al cliente en la carga inicial (A-4 / B-7).

## 2. Correcciones aplicadas (archivos propios)

### Pipeline criptográfico

| ID | Sev. | Hallazgo | Archivo | Estado |
|---|---|---|---|---|
| C-1 | alta | El verificador lanzaba con entradas mal formadas (`p.key_id.slice` sobre `undefined`): un lote hostil tumbaba al consumidor. Ahora hay validación estructural y `ingest` nunca lanza; devuelve `tampered`. | `web/src/lib/pipeline/verifier.ts` | corregido |
| C-2 | alta | La cadena `prev_hash` no se comprobaba tras un hueco ni en lotes reordenados. Ahora cada lote aceptado se compara con su vecino anterior y con el siguiente si ya llegó; si no encaja es `broken_chain`. | `verifier.ts` | corregido |
| C-3 | alta | La pérdida de los últimos lotes era indetectable. Se agregó `total_batches` opcional dentro del payload firmado (`Collector({ totalBatches })`), `Verifier.declaredTotal` y `finalize(expectedCount?)`. El total firmado manda sobre el no autenticado. | `types.ts`, `collector.ts`, `verifier.ts` | corregido en la librería; falta adoptarlo (A-2, B-3, B-5) |
| C-4 | media | Maleabilidad base64: `atob` acepta variantes de la misma firma y `prev_hash` se calcula sobre el texto, así que un atacante podía re-codificar un lote válido y hacer que el siguiente legítimo pareciera cadena rota. Ahora se exige base64 canónico y longitud exacta de 3309 bytes. | `canonical.ts` (`fromBase64Strict`), `verifier.ts` | corregido |
| C-5 | media | Un lote distinto, válidamente firmado, con un `seq` ya aceptado se etiquetaba `duplicate` (ocultaba una bifurcación). Ahora mismo hash es `duplicate` y mismo seq con otro contenido es `broken_chain`, conservando el primero. | `verifier.ts` | corregido |
| C-6 | media | Replay cruzado: no se comprobaba `stream_id`. Ahora se fija por opción (`{ streamId }`) o con el primer lote válido. | `verifier.ts` | corregido |
| C-7 | media | `canonicalJSON` producía JSON inválido o distinto al que viaja: `undefined` en arreglos, `Date` como `{}`, funciones, y desbordaba la pila con ciclos. Ahora respeta `toJSON` y lanza con lo no representable. | `canonical.ts` | corregido |
| C-8 | baja | No se validaba `alg`; un `seq` absurdo firmado marcaba millones de faltantes (tope `MAX_SEQ_JUMP`). | `verifier.ts` | corregido |
| C-9 | baja | `runBenchmark` dividía por cero con `n=0` y medía el payload en caracteres, no en bytes. Nuevo `runBenchmarkAsync`, que cede el hilo entre lotes. | `bench.ts` | corregido |

Comprobado sin cambios: falsificar copiando el `key_id` confiable da `tampered` (nuevo `forgeWithSpoofedKeyId` en `attacks.ts`); cualquier bit cambiado en la firma, una firma trasplantada o una firma sin el context string no verifican; un lote alterado no ocupa su `seq`, así que el original se acepta después.

Límites que siguen en pie y quedaron documentados en la UI (`Limits.tsx`):
- Si no llega ningún lote, la supresión total es invisible.
- Un flujo abierto necesita un latido firmado.
- Firmar `SHA3-256(payload)` acota la seguridad efectiva a la resistencia a colisiones del hash (nivel 2), no al nivel 3 de ML-DSA-65.
- El estado del verificador crece sin límite en flujos muy largos.

### Seguridad

| ID | Sev. | Hallazgo | Archivo | Estado |
|---|---|---|---|---|
| S-1 | alta | El sitio no enviaba cabeceras de seguridad (solo el HSTS de Vercel). Se agregaron CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP y HSTS, y se quitó `X-Powered-By`. | `web/next.config.ts` | corregido |
| S-2 | media | La CSP usa `'unsafe-inline'` en scripts y estilos porque la página es estática (un nonce exigiría render dinámico). | `next.config.ts` | pendiente (aceptado; alternativa: SRI experimental de Next) |
| S-3 | baja | Un JSON de `/quantum/*.json` con otra forma rompía el render de toda la página. Ahora se valida y cae en el estado de error del panel. | `web/src/lib/quantum.ts` | corregido |
| S-4 | baja | `npm audit`: 7 avisos moderados, todos de desarrollo (`minimatch` vía `typescript-eslint`). `npm audit fix` no los resuelve sin subir versiones; con `--omit=dev` hay 0. | `web/package-lock.json` | pendiente |

La CSP permite solo `tiles.openfreemap.org` y `server.arcgisonline.com` además del propio origen. Si se agrega otro origen en el cliente, hay que sumarlo en `MAP_ORIGINS`.

### Rendimiento

| ID | Sev. | Hallazgo | Archivo | Estado |
|---|---|---|---|---|
| P-1 | alta | El `<h1>` y la bajada salían del servidor con `opacity:0` y esperaban hidratación más animación: LCP ~1,1 s contra FCP ~0,06 s, e invisibles sin JavaScript. Ahora entran solo con desplazamiento. | `web/src/components/Hero.tsx` | corregido |
| P-2 | media | El benchmark congelaba la página ~1 s. Ahora usa `runBenchmarkAsync` y carga el snapshot con `import()` dinámico. | `web/src/components/Benchmark.tsx` | corregido |
| P-3 | baja | El worker de MapLibre se servía sin caché. | `next.config.ts` | corregido (24 h + SWR) |

### Accesibilidad

| ID | Sev. | Hallazgo | Archivo | Estado |
|---|---|---|---|---|
| X-1 | media | Desajuste de hidratación con `prefers-reduced-motion`: `Embers`, `SectionHeading` y `Rail` ramificaban el marcado según `useReducedMotion()`. Nuevo hook `useReducedMotionSafe`. Verificado sin errores con y sin la preferencia. | `Hero.tsx`, `ui/Section.tsx`, `HowItWorks.tsx`, `ui/useReducedMotionSafe.ts` | corregido |
| X-2 | media | `Segmented` (radiogroup) y las pestañas cuánticas no seguían el patrón ARIA: todos los botones eran topes de tabulación y no había flechas. Ahora tienen tabindex itinerante y flechas / Inicio / Fin. | `ui/Segmented.tsx`, `quantum/QuantumLayer.tsx` | corregido |
| X-3 | media | `AnimatedNumber` dentro de regiones `aria-live` anunciaba cada cuadro intermedio. Ahora la cifra animada va `aria-hidden` y el valor final en un span solo para lectores. | `ui/AnimatedNumber.tsx` | corregido |
| X-4 | baja | `<dl>` inválido en Límites (dt/dd anidados dos niveles); ahora es lista con encabezados. | `Limits.tsx` | corregido |
| X-5 | baja | Sin JavaScript, 77 elementos quedaban en `opacity:0`. Se agregó un `<noscript>` que anula los estados ocultos. | `app/layout.tsx` | corregido |
| X-6 | baja | Enlaces externos sin aviso de pestaña nueva; `lang="es"` pasó a `es-AR`; red de seguridad CSS para movimiento reducido. | `Hero.tsx`, `Footer.tsx`, `layout.tsx`, `globals.css` | corregido |
| X-7 | baja | Las brasas y el ticker del hero se animan sin pausa (WCAG 2.2.2); son decorativos y respetan movimiento reducido. | `Hero.tsx` | pendiente |

Contraste: todo el texto cumple AA (el peor caso, `smoke` sobre `char`, da 5,2:1). Los bordes de botones (`line-strong`, 2,0:1) no llegan a 3:1, pero los botones tienen texto.

### SEO y metadatos

| ID | Sev. | Hallazgo | Archivo | Estado |
|---|---|---|---|---|
| M-1 | media | Faltaban `og:image`, `og:url`, canonical, `metadataBase`, `robots.txt` y `sitemap.xml` (404 en el desplegado); la tarjeta de Twitter era `summary`. | `layout.tsx`, `opengraph-image.tsx`, `robots.ts`, `sitemap.ts`, `lib/site.ts` | corregido |

La URL del sitio sale de `NEXT_PUBLIC_SITE_URL`, luego `VERCEL_PROJECT_PRODUCTION_URL`, y por último la URL desplegada actual. Conviene fijar `NEXT_PUBLIC_SITE_URL` si se usa un dominio propio.

### Honestidad del contenido y capa cuántica

| ID | Sev. | Hallazgo | Archivo | Estado |
|---|---|---|---|---|
| H-1 | media | "Si alguno falta o se repite, queda registrado" prometía de más: el corte al final no se detectaba. Texto acotado y nuevo ítem "No ve la pérdida del último lote". | `Limits.tsx`, `HowItWorks.tsx` | corregido |
| H-2 | baja | "Ocho Hadamard, una medición, 32 bytes" era engañoso: son 32 disparos de 8 bits. También "Entropía por bit" pasó a "Entropía de Shannon por bit", con la aclaración de que las pruebas no certifican aleatoriedad. | `QuantumLayer.tsx` | corregido |
| H-3 | baja | Grover: "8 en promedio" es la aproximación N/2; el valor exacto es 8,5. Texto suavizado y comentado. | `QuantumLayer.tsx`, `quantum/grover.py`, `quantum/README.md` | corregido |
| H-4 | media | La fuente del incendio de Cafayate enlaza a la portada de `salta.gob.ar`, no al parte del 14/06/2026: la afirmación no es verificable desde el enlace. No inventé una URL. | `Hero.tsx:142`, `Footer.tsx:4` | pendiente (necesita la URL real del parte) |
| H-5 | baja | `requirements.txt` sin cotas; se acotó a las versiones probadas. | `quantum/requirements.txt` | corregido |

Los números cuánticos publicados cierran. Los recalculé desde los JSON:
- **QRNG:** χ² = 255,25 con 255 g.l., p = 0,484, entropía 0,999995.
- **Grover:** sin²((2k+1)θ) coincide con `p_theory`; óptimo k = 3 = ⌊π/4·√16⌋, 95,7 % empírico contra 96,1 % teórico.
- **Shor:** 4 es el orden de 7 mod 15; mcd(48, 15) = 3 y mcd(50, 15) = 5; fases 0, 1/4, 1/2, 3/4 equiprobables.

Las aclaraciones "no es QKD", "simulado", "sin hardware IBM" y "NASA no firma el dato" están presentes y son correctas.

### Tests agregados

- `web/src/lib/__tests__/pipeline.hardening.test.ts`: JSON canónico (orden, ida y vuelta, `toJSON`, tipos no serializables, ciclos, `__proto__`), base64 estricto, entradas hostiles, `key_id` suplantado, maleabilidad de firma, context string, replay tardío, reordenamiento inverso, huecos múltiples, pérdida más reorden, bifurcación, cadena rota tardía, stream cruzado, total firmado, benchmark.
- `web/src/lib/__tests__/quantum-data.test.ts`: forma de los JSON y las afirmaciones de QRNG, Grover y Shor.
- `quantum/verify_outputs.py`: la misma verificación sin Qiskit, con código de salida 1 si algo no cierra.

## 3. Pendientes para el worker A (backend)

| ID | Sev. | Archivo:línea | Hallazgo | Arreglo sugerido |
|---|---|---|---|---|
| A-1 | alta | `web/src/lib/server/sse.ts:117` | Cada conexión SSE crea un `Collector` nuevo (seq 0, mismo `stream_id`). Una sesión vieja completa reinyectada verifica toda "ok": no hay nada firmado que la ate a un ciclo. | Derivar el `streamId` del ciclo (p. ej. con `fetched_at`) o firmar un id de sesión; que el cliente rechace ciclos más viejos que el último aceptado. |
| A-2 | alta | `sse.ts:146` | `hello` y `done` viajan sin firmar; quien suprima los últimos lotes puede reescribir `done.batches`. | Pasar `totalBatches: grupos.length` al `Collector` (ya soportado, C-3). |
| A-3 | media | `sse.ts:142` | Hasta 60 firmas síncronas por conexión, sin caché, límite de streams ni rate limit; `batch=1..50` da 50 variantes. | Memoizar los lotes firmados por `(fetched_at, tamaño)`, restringir `batch` a pocos valores, limitar por IP. |
| A-4 | media | `web/src/lib/firms.ts:3` | Importa estáticamente `firms-salta.json`; como el cliente importa `firms.ts`, el snapshot entra al bundle inicial. | Mover `loadHistorical` y el JSON a un módulo aparte, solo servidor o `import()` dinámico. |
| A-5 | media | `web/src/app/api/stream/route.ts:14-15` | Con `FIRMS_MAP_KEY` el peor caso es 8 s + 8 s + 59 × 0,7 s ≈ 58 s contra `maxDuration = 60`; si se corta, no llega `done`. | Presupuesto global para los fallbacks, o bajar `MAX_BATCHES` o el intervalo. |
| A-6 | media | `web/src/lib/server/firms-live.ts:85` | Sin caché negativa: con el upstream caído cada pedido repite todos los fetch (hasta 8–16 s). `use cache` en memoria no persiste entre instancias serverless. | Caché negativa corta y `s-maxage` corto también en respuestas degradadas. |
| A-7 | media/baja | `web/src/lib/server/passes.ts:51` | `MIN_ELEVATION_DEG = 10` cuenta pasadas que no observan Salta (el borde del barrido VIIRS equivale a ~20°, MODIS ~24°; cálculo del auditor, no verificado contra una fuente). | Umbral por instrumento o campo `in_swath`. |
| A-8 | baja | `passes.ts:56`, `sse.ts:42`, `firms-live.ts:133` | `Number(raw ?? DEFAULT)`: un parámetro vacío (`?hours=`) da 0 y se acota a 1 en vez del valor por defecto. | Tratar `""` como ausente. |
| A-9 | baja | `web/src/lib/server/weather.ts:66` | Un solo valor nulo en un punto degrada el clima de los seis. | Descartar solo ese punto. |
| A-10 | baja | `web/src/app/api/firms/route.ts:20` | Resultados parciales (productos caídos) se cachean 5–10 min como completos. | `s-maxage` corto si hay fuentes fallidas. |
| A-11 | baja | `sse.ts:10` y otros | `Connection: keep-alive` es inválido en HTTP/2; `sse.ts`, `passes.ts` y `fire-risk.ts` no importan `server-only`; `hello` no incluye `seed_origin`. | Ajustes puntuales. |

Revisado y correcto en A: `FIRMS_MAP_KEY` y `COLLECTOR_SEED_HEX` no se filtran en respuestas ni errores; ningún cliente importa `lib/server/*`; los parámetros se acotan; no hay SSRF (URLs constantes); el stream limpia timers al abortar; las rutas nunca responden 500. No se verificó que `request.signal` aborte de verdad en Vercel.

## 4. Pendientes para el worker B (tiempo real)

| ID | Sev. | Archivo:línea | Hallazgo | Arreglo sugerido |
|---|---|---|---|---|
| B-1 | alta | `web/src/lib/live/streamStore.ts:97` | `SIGNATURE_OK` incluye `broken_chain`: una bifurcación o un lote de otro flujo queda como verificado, se dibuja como foco normal y suma a los KPI. | Tratarlo como no aceptado. |
| B-2 | alta | `streamStore.ts:277`, `:340`, `:346` | `new Verifier([clave])` sin `streamId` y uno nuevo por cada `hello`: un segundo `hello` a mitad de conexión resetea el estado. | Pasar `{ streamId: collector.stream_id }` e ignorar `hello` repetidos (junto con A-1). |
| B-3 | alta | `web/src/lib/demo/engine.ts:326-328` | El sandbox nunca llama `finalize`: suprimir el último lote deja "Perdidos = 0" y `BatchLog.tsx:76` muestra en verde que no quedó ningún hueco. | Al terminar, `verifier.finalize(this.source.length)`. |
| B-4 | alta | `web/src/components/live/LiveMonitor.tsx:177` | "Ver el escenario histórico de Cafayate": ese escenario es sintético. | "escenario sintético de Cafayate". |
| B-5 | media | `streamStore.ts:404` | Usa `done.batches` (sin firmar) contra un contador que incluye inválidos y duplicados, y recuenta huecos ya contados. | `verifier.finalize()` con el total firmado. |
| B-6 | media | `engine.ts:106`, `:356` | `broken_chain` se cuenta como "Válidos" y se pinta como punto válido, mientras el badge dice "Cadena rota" en rojo. Con C-2 y C-5 ese estado ahora aparece en más casos. | Contador propio y punto "bad". |
| B-7 | media | `LiveDemo.tsx:6`, `engine.ts:4` | Cadenas que meten el snapshot en el bundle inicial: `LiveDemo → @/lib/firms` y `engine → ../firms` (también vía `LiveMonitor`). | Mover `toBatches` a un módulo sin el JSON; cargar el snapshot con `import()` al elegir escenario. |
| B-8 | media | `LiveDemo.tsx:19`, `LiveMonitor.tsx:22` | Los dos mapas se montan al cargar la página aunque estén fuera de pantalla. | Montarlos con IntersectionObserver. |
| B-9 | media | `engine.ts:277`, `streamStore.ts` | Firma y verificación ML-DSA en el hilo principal, sin Web Worker; es la causa del TBT tras recorrer la página. | Web Worker, o ceder el hilo entre lotes como `runBenchmarkAsync`. |
| B-10 | media | `web/src/components/demo/FireMap.tsx:304` | La animación de pulso con `repeat: Infinity` repinta dos mapas WebGL a 60 fps para siempre, aun fuera de pantalla. | Pausar fuera de viewport y sin focos nuevos. |
| B-11 | media | `engine.ts:310` | "Reordenar" sobre el último lote se descarta sin aviso. | Registrar el motivo o deshabilitar el botón. |
| B-12 | media | `streamStore.ts:341-349` | Si `hello.key_id` difiere, adopta la clave nueva de `/api/collector` en silencio. | Avisar de la rotación en el registro. |
| B-13 | media | `LiveDemo.tsx:239-241` | Selector deshabilitado solo con `pointer-events-none` y `aria-disabled` sobre un `div`: sigue operable por teclado. | Prop `disabled` real (puedo agregarla a `Segmented` si se pide). |
| B-14 | media | `FireMap.tsx:387` | `role="application"` anula el modo lectura del lector de pantalla; el canvas conserva la etiqueta inglesa "Map". | `role="region"` y traducir `Map.Title`. |
| B-15 | media | `LiveDemo.tsx:210` | "…un flujo de focos en vivo": el escenario por defecto es sintético. | Quitar "en vivo". |
| B-16 | media | `web/src/components/SiteNav.tsx:33` | En móvil solo queda un enlace; el resto de la navegación se oculta sin alternativa. | Menú compacto. |
| B-17 | media | `streamStore.ts:465` | Crea un arreglo nuevo de detecciones en cada `emit`, lo que dispara `setData` del mapa completo. | Cachear el arreglo. |
| B-18 | baja | varios | Textos imprecisos ("ninguna firma rechazada" cuenta huecos y duplicados; "Lote válido" en la leyenda es un foco); objetivos táctiles de 28–36 px; texto de 10 px en `PassesPanel.tsx:50`; `aria-valuemax` 0 sin datos. | Ajustes puntuales. |

Revisado y correcto en B: snapshots estables para `useSyncExternalStore`; limpieza de timers y EventSource; backoff; `JSON.parse` protegido; la clave se toma de `/api/collector` y no del `hello`; popups con `textContent`; aviso "indicativo, no oficial" visible; Cafayate rotulado sintético en el selector; voseo consistente. El cliente no usa orígenes ni APIs que la CSP o la Permissions-Policy bloqueen.

## 5. Notas de contrato (cambios aditivos)

- `Verifier(keys, { streamId? })`, `declaredTotal`, `streamId`, `finalize(expectedCount?)`, `MAX_SEQ_JUMP`.
- `Collector({ totalBatches? })` firma `total_batches` en cada payload; sin esa opción el lote es idéntico al de antes.
- `BatchPayload.total_batches?: number`.
- `fromBase64Strict`, `runBenchmarkAsync`, `forgeWithSpoofedKeyId`, `validateQuantum`.
- Cambio de comportamiento: mismo `seq` con contenido distinto pasa de `duplicate` a `broken_chain`; un lote tardío que no encadena pasa de `reordered` a `broken_chain`. `canonicalJSON` ahora lanza con valores no serializables.
- `CONTRACTS.md` no se tocó; conviene reflejar estos puntos ahí.
