import type { NextRequest } from "next/server";
import { cacheLife } from "next/cache";
import type { FireDetection } from "@/lib/types";
import { SALTA_BBOX, inSalta, loadHistorical, parseFirmsCsv, sortDetections } from "@/lib/firms";

// GET /api/firms?days=1..5
// → { source, fetched_at, detections, origin, note? }
// Cadena de fallbacks (nunca responde 500):
//   1. FIRMS area API (requiere env FIRMS_MAP_KEY)      → source "firms-live"
//   2. CSV públicos 24 h de Sudamérica, recorte a Salta → source "firms-live"
//   3. Snapshot local web/src/data/firms-salta.json     → source "historical"

const FIRMS = "https://firms.modaps.eosdis.nasa.gov";
const TIMEOUT_MS = 8000;
const PUBLIC_24H = [
  `${FIRMS}/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_24h.csv`,
  `${FIRMS}/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_24h.csv`,
  `${FIRMS}/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_America_24h.csv`,
];

type Live = { origin: "firms-area-api" | "firms-public-24h"; fetched_at: string; detections: FireDetection[] };

async function fetchText(url: string): Promise<string> {
  // cache: "no-store" → el caché lo maneja `use cache` (los CSV públicos superan el límite del data cache de fetch)
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`FIRMS HTTP ${res.status}`);
  return res.text();
}

function dedupe(dets: FireDetection[]): FireDetection[] {
  return sortDetections([...new Map(dets.map((d) => [d.id, d])).values()]);
}

/** FIRMS area API. Lanza si falla (los errores no se cachean). */
async function fetchAreaApi(days: number): Promise<Live> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) throw new Error("FIRMS_MAP_KEY no configurada");
  const { west, south, east, north } = SALTA_BBOX;
  const csv = await fetchText(
    `${FIRMS}/api/area/csv/${encodeURIComponent(key)}/VIIRS_SNPP_NRT/${west},${south},${east},${north}/${days}`,
  );
  // Con clave inválida o cuota agotada FIRMS responde 200 con un texto que no es CSV.
  if (!/^\s*latitude,/i.test(csv)) throw new Error("respuesta inesperada del área API");
  return {
    origin: "firms-area-api",
    fetched_at: new Date().toISOString(),
    detections: dedupe(parseFirmsCsv(csv, "firms-live").filter(inSalta)),
  };
}

/** CSV públicos de 24 h (sin clave). Lanza si ninguno responde. */
async function fetchPublic24h(): Promise<Live> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  const results = await Promise.allSettled(PUBLIC_24H.map(fetchText));
  const ok = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
  if (ok.length === 0) throw new Error("CSV públicos de FIRMS no disponibles");
  return {
    origin: "firms-public-24h",
    fetched_at: new Date().toISOString(),
    detections: dedupe(ok.flatMap((r) => parseFirmsCsv(r.value, "firms-live")).filter(inSalta)),
  };
}

export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("days") ?? "1");
  const days = Number.isFinite(raw) ? Math.min(5, Math.max(1, Math.trunc(raw))) : 1;
  const errors: string[] = [];

  const attempts: Array<() => Promise<Live>> = [];
  if (process.env.FIRMS_MAP_KEY) attempts.push(() => fetchAreaApi(days));
  attempts.push(fetchPublic24h);

  for (const attempt of attempts) {
    try {
      const live = await attempt();
      return Response.json(
        {
          source: "firms-live",
          origin: live.origin,
          fetched_at: live.fetched_at,
          days: live.origin === "firms-area-api" ? days : 1,
          detections: live.detections,
        },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
      );
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  let detections: FireDetection[] = [];
  try {
    detections = loadHistorical();
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  return Response.json(
    {
      source: "historical",
      origin: "local-snapshot",
      fetched_at: new Date().toISOString(),
      days,
      detections,
      note: "FIRMS en vivo no disponible; se devuelve el snapshot local (real congelado + escenario sintético).",
      errors,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
