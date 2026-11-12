import type { NextRequest } from "next/server";
import { MIN_ELEVATION_DEG, SALTA_OBSERVER, clampHours, computePasses, type Pass } from "@/lib/server/passes";
import { getTles } from "@/lib/server/tle";

// GET /api/passes?hours=24 (máx. 48)
// → { computed_at, tle_source, observer, hours, min_elevation_deg, passes:[...], satellites, degraded?, note? }
// Próximas pasadas de NOAA-20/21, Suomi NPP (VIIRS), Aqua y Terra (MODIS) sobre Salta.
// TLE de CelesTrak cacheados ~6 h; fallback a TLE embebidos. Nunca 500.
// Dinámica por leer `request.nextUrl` (Cache Components).

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const hours = clampHours(request.nextUrl.searchParams.get("hours") ?? undefined);
  const observer = { lat: SALTA_OBSERVER.lat, lon: SALTA_OBSERVER.lon, name: SALTA_OBSERVER.name };
  const now = new Date();
  try {
    const tles = await getTles();
    const passes = computePasses(tles.entries, SALTA_OBSERVER, { from: now, hours });
    return Response.json(
      {
        computed_at: now.toISOString(),
        tle_source: tles.tle_source,
        observer,
        hours,
        min_elevation_deg: MIN_ELEVATION_DEG,
        passes,
        satellites: tles.satellites,
        ...(tles.degraded ? { degraded: true, note: tles.note } : {}),
      },
      { headers: { "Cache-Control": tles.degraded ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (e) {
    return Response.json(
      {
        computed_at: now.toISOString(),
        tle_source: "embedded-fallback",
        observer,
        hours,
        min_elevation_deg: MIN_ELEVATION_DEG,
        passes: [] as Pass[],
        degraded: true,
        note: `No se pudieron calcular las pasadas: ${e instanceof Error ? e.message : String(e)}`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
