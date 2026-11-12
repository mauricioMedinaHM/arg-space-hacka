
## Datos FIRMS (requiere acción humana)
- [ ] Configurar la variable de entorno `FIRMS_MAP_KEY` en Vercel (Project → Settings → Environment Variables) y en `web/.env.local` para desarrollo. Habilita el FIRMS area API en `GET /api/firms?days=1..5`.
  - La clave es gratuita: pedirla en https://firms.modaps.eosdis.nasa.gov/api/map_key/ (llega por email; límite ~5000 transacciones cada 10 min).
  - Sin la clave la ruta igual funciona: usa los CSV públicos de 24 h de Sudamérica (solo 1 día, `days` se ignora) y, si fallan, el snapshot local `web/src/data/firms-salta.json`.
- [ ] (Opcional) Regenerar el snapshot antes de la demo: `cd web && node scripts/build-firms-dataset.mjs` (`--offline` reusa las detecciones reales ya guardadas y solo regenera el sintético).

## Tiempo real — variables de entorno (requiere acción humana)
- [ ] `COLLECTOR_SEED_HEX` en Vercel (Production y Preview) y en `web/.env.local`: 64 caracteres hex (32 bytes) = semilla de la clave ML-DSA-65 con la que el servidor firma `/api/stream`. Generar con `openssl rand -hex 32`. Marcarla como *Sensitive*; no commitearla.
  - Sin ella todo funciona, pero `/api/collector` responde `seed_origin: "qrng-demo"`: la clave sale de `web/public/quantum/qrng.json`, que es público → cualquiera puede firmar lotes válidos. Aceptable solo para la demo.
  - Cambiarla rota la clave: los clientes abiertos verán `unknown_key` hasta recargar `/api/collector`.
- [ ] `FIRMS_MAP_KEY` (ver arriba): habilita el área API con NOAA-20, NOAA-21, S-NPP y MODIS en paralelo y `days` 1..5. Sin ella `/api/firms` y `/api/stream` usan los CSV públicos de 24 h (VIIRS x3 + MODIS).
- [ ] (Opcional) Refrescar `web/src/lib/server/tle-fallback.ts` antes de una demo sin red (TLE del 2026-11-12; ver comando en el archivo).
- [ ] Verificar en Vercel que `/api/stream` no se corte: `maxDuration = 60` requiere un plan/configuración que lo permita (una sesión típica dura 20-45 s).
