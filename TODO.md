
## Datos FIRMS (requiere acción humana)
- [ ] Configurar la variable de entorno `FIRMS_MAP_KEY` en Vercel (Project → Settings → Environment Variables) y en `web/.env.local` para desarrollo. Habilita el FIRMS area API en `GET /api/firms?days=1..5`.
  - La clave es gratuita: pedirla en https://firms.modaps.eosdis.nasa.gov/api/map_key/ (llega por email; límite ~5000 transacciones cada 10 min).
  - Sin la clave la ruta igual funciona: usa los CSV públicos de 24 h de Sudamérica (solo 1 día, `days` se ignora) y, si fallan, el snapshot local `web/src/data/firms-salta.json`.
- [ ] (Opcional) Regenerar el snapshot antes de la demo: `cd web && node scripts/build-firms-dataset.mjs` (`--offline` reusa las detecciones reales ya guardadas y solo regenera el sintético).
