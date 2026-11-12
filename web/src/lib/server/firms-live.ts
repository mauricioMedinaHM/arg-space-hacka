// Fetch compartido de NASA FIRMS en vivo (lo usan /api/firms y /api/stream).
// Cadena de fallbacks (nunca lanza):
//   1. FIRMS area API (env FIRMS_MAP_KEY): VIIRS NOAA-20/NOAA-21/S-NPP + MODIS en paralelo
//   2. CSV públicos 24 h de Sudamérica (VIIRS x3 + MODIS c6.1), recorte a Salta
//   3. Snapshot local web/src/data/firms-salta.json (degraded)
import "server-only";
import { cacheLife } from "next/cache";
import type { FireDetection } from "../types";
import { SALTA_BBOX, inSalta, mergeDetections, parseFirmsCsv } from "../firms";
import { loadHistorical } from "../firms-historical";

const FIRMS = "https://firms.modaps.eosdis.nasa.gov";
const TIMEOUT_MS = 8000;

type Sat = FireDetection["satellite"];

/** Productos NRT del área API. `satellite` = valor por defecto si la fila no lo trae. */
export const AREA_SOURCES: ReadonlyArray<{ id: string; satellite?: Sat }> = [
  { id: "VIIRS_NOAA20_NRT", satellite: "N20" },
  { id: "VIIRS_NOAA21_NRT", satellite: "N21" },
  { id: "VIIRS_SNPP_NRT", satellite: "N" },
  { id: "MODIS_NRT" }, // trae Terra/Aqua por fila
];

export const PUBLIC_24H: ReadonlyArray<{ id: string; url: string; satellite?: Sat }> = [
  {
    id: "J1_VIIRS_C2_24h",
    url: `${FIRMS}/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_24h.csv`,
    satellite: "N20",
  },
  {
    id: "J2_VIIRS_C2_24h",
    url: `${FIRMS}/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_America_24h.csv`,
    satellite: "N21",
  },
  {
    id: "SUOMI_VIIRS_C2_24h",
    url: `${FIRMS}/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_24h.csv`,
    satellite: "N",
  },
  {
    id: "MODIS_C6_1_24h",
    url: `${FIRMS}/data/active_fire/modis-c6.1/csv/MODIS_C6_1_South_America_24h.csv`,
  },
];

export interface SourceStatus {
  id: string;
  ok: boolean;
  count: number;
  error?: string;
}

interface Live {
  origin: "firms-area-api" | "firms-public-24h";
  fetched_at: string;
  detections: FireDetection[];
  sources: SourceStatus[];
}

export interface FirmsResult {
  source: "firms-live" | "historical";
  origin: Live["origin"] | "local-snapshot";
  fetched_at: string;
  days: number;
  detections: FireDetection[];
  /** Estado por producto/satélite consultado (solo en vivo). */
  sources?: SourceStatus[];
  degraded?: true;
  note?: string;
  errors?: string[];
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function fetchCsv(url: string): Promise<string> {
  // cache: "no-store" → el caché lo maneja `use cache` (los CSV públicos superan el límite del data cache de fetch)
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`FIRMS HTTP ${res.status}`);
  const text = await res.text();
  // Con clave inválida o cuota agotada FIRMS responde 200 con un texto que no es CSV.
  if (!/^\s*latitude,/i.test(text)) throw new Error("respuesta inesperada de FIRMS (no es CSV)");
  return text;
}

/** Combina resultados parciales; lanza solo si TODOS fallaron (así el error no se cachea). */
function combine(
  origin: Live["origin"],
  specs: ReadonlyArray<{ id: string; satellite?: Sat }>,
  results: PromiseSettledResult<string>[],
): Live {
  const sources: SourceStatus[] = [];
  const lists: FireDetection[][] = [];
  results.forEach((r, i) => {
    const spec = specs[i];
    if (r.status === "fulfilled") {
      const dets = parseFirmsCsv(r.value, "firms-live", spec.satellite).filter(inSalta);
      lists.push(dets);
      sources.push({ id: spec.id, ok: true, count: dets.length });
    } else {
      sources.push({ id: spec.id, ok: false, count: 0, error: errMsg(r.reason) });
    }
  });
  if (lists.length === 0) {
    throw new Error(`${origin}: ningún producto respondió (${sources.map((s) => `${s.id}: ${s.error}`).join("; ")})`);
  }
  return { origin, fetched_at: new Date().toISOString(), detections: mergeDetections(...lists), sources };
}

/** FIRMS area API, 4 productos en paralelo. Lanza si todos fallan. */
async function fetchAreaApi(days: number): Promise<Live> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) throw new Error("FIRMS_MAP_KEY no configurada");
  const { west, south, east, north } = SALTA_BBOX;
  const results = await Promise.allSettled(
    AREA_SOURCES.map((s) =>
      fetchCsv(`${FIRMS}/api/area/csv/${encodeURIComponent(key)}/${s.id}/${west},${south},${east},${north}/${days}`),
    ),
  );
  return combine("firms-area-api", AREA_SOURCES, results);
}

/** CSV públicos de 24 h (sin clave). Lanza si ninguno responde. */
async function fetchPublic24h(): Promise<Live> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  const results = await Promise.allSettled(PUBLIC_24H.map((s) => fetchCsv(s.url)));
  return combine("firms-public-24h", PUBLIC_24H, results);
}

export function clampDays(raw: unknown): number {
  const n = raw === null || raw === undefined || String(raw).trim() === "" ? 1 : Number(raw);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.trunc(n))) : 1;
}

/**
 * Caché negativa (en memoria, por instancia): con el upstream caído no se repiten los fetch
 * (hasta 8 s por etapa) en cada pedido. `use cache` no guarda errores, así que se lleva a mano.
 */
export const NEGATIVE_TTL_MS = 60_000;
const failedUntil = new Map<string, { until: number; error: string }>();
let degradedMemo: { until: number; days: number; result: FirmsResult } | null = null;

/** Detecciones FIRMS de Salta con fallbacks. Nunca lanza. */
export async function getLiveFirms(daysRaw: unknown = 1): Promise<FirmsResult> {
  const days = clampDays(daysRaw);
  const errors: string[] = [];
  const now = Date.now();

  // Todo falló hace menos de NEGATIVE_TTL_MS: se devuelve el mismo resultado degradado
  // (mismo `fetched_at` → mismo ciclo en /api/stream, que así no vuelve a firmar).
  if (degradedMemo && degradedMemo.until > now && degradedMemo.days === days) return degradedMemo.result;

  const attempts: Array<{ id: string; run: () => Promise<Live> }> = [];
  if (process.env.FIRMS_MAP_KEY) attempts.push({ id: `area:${days}`, run: () => fetchAreaApi(days) });
  attempts.push({ id: "public-24h", run: fetchPublic24h });

  for (const attempt of attempts) {
    const neg = failedUntil.get(attempt.id);
    if (neg && neg.until > now) {
      errors.push(`${neg.error} (caché negativa)`);
      continue;
    }
    try {
      const live = await attempt.run();
      failedUntil.delete(attempt.id);
      const failed = live.sources.filter((s) => !s.ok);
      return {
        source: "firms-live",
        origin: live.origin,
        fetched_at: live.fetched_at,
        days: live.origin === "firms-area-api" ? days : 1,
        detections: live.detections,
        sources: live.sources,
        ...(failed.length > 0
          ? { note: `Productos sin respuesta (se omiten): ${failed.map((s) => s.id).join(", ")}.` }
          : {}),
        ...(errors.length > 0 ? { errors } : {}),
      };
    } catch (e) {
      const error = errMsg(e);
      failedUntil.set(attempt.id, { until: Date.now() + NEGATIVE_TTL_MS, error });
      errors.push(error);
    }
  }

  let detections: FireDetection[] = [];
  try {
    detections = loadHistorical();
  } catch (e) {
    errors.push(errMsg(e));
  }
  const result: FirmsResult = {
    source: "historical",
    origin: "local-snapshot",
    fetched_at: new Date().toISOString(),
    days,
    detections,
    degraded: true,
    note: "FIRMS en vivo no disponible; se devuelve el snapshot local (real congelado + escenario sintético).",
    errors,
  };
  degradedMemo = { until: Date.now() + NEGATIVE_TTL_MS, days, result };
  return result;
}
