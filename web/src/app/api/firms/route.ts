import type { NextRequest } from "next/server";
import { getLiveFirms } from "@/lib/server/firms-live";

// GET /api/firms?days=1..5
// → { source, origin, fetched_at, days, detections, sources?, degraded?, note?, errors? }
// Cadena de fallbacks (nunca responde 500) — ver lib/server/firms-live.ts:
//   1. FIRMS area API (env FIRMS_MAP_KEY): VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT,
//      VIIRS_SNPP_NRT y MODIS_NRT en paralelo                → source "firms-live"
//   2. CSV públicos 24 h de Sudamérica (VIIRS x3 + MODIS)    → source "firms-live"
//   3. Snapshot local web/src/data/firms-salta.json          → source "historical", degraded
// Leer `request.nextUrl` hace la ruta dinámica (Cache Components): no se prerenderiza.

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const result = await getLiveFirms(request.nextUrl.searchParams.get("days"));
  // Completo → 5 min. Parcial (algún producto caído) o degradado → 60 s, para no fijar
  // en el CDN una respuesta incompleta ni martillar el upstream caído.
  const partial = result.sources?.some((s) => !s.ok) ?? false;
  const cacheControl =
    result.source === "firms-live" && !partial
      ? "public, s-maxage=300, stale-while-revalidate=600"
      : "public, s-maxage=60, stale-while-revalidate=60";
  return Response.json(result, { headers: { "Cache-Control": cacheControl } });
}
