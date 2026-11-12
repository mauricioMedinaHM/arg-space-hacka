// TLE de CelesTrak (GP API) con caché ~6 h y respaldo embebido por satélite.
import "server-only";
import { cacheLife } from "next/cache";
import { SATELLITES, isValidTle, parseTleText, tleEpoch, type TleEntry } from "./passes";
import { TLE_FALLBACK, TLE_FALLBACK_DATE } from "./tle-fallback";

const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php";

export type TleSource = "celestrak" | "embedded-fallback" | "celestrak+embedded-fallback";

export interface TleSet {
  tle_source: TleSource;
  entries: TleEntry[];
  satellites: Array<{ satellite: string; norad_id: number; tle_epoch: string; source: "celestrak" | "embedded-fallback" }>;
  degraded?: true;
  note?: string;
}

/** Un TLE por NORAD id. Lanza si falla (no se cachea el error). Caché 6 h (pedido de CelesTrak: no sondear seguido). */
async function fetchTle(noradId: number): Promise<[string, string]> {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 21_600, expire: 86_400 });
  const res = await fetch(`${CELESTRAK}?CATNR=${noradId}&FORMAT=TLE`, {
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
    headers: { "User-Agent": "firms-integrity-demo" },
  });
  if (!res.ok) throw new Error(`CelesTrak HTTP ${res.status}`);
  const tle = parseTleText(await res.text());
  if (!tle || !isValidTle(tle[0], tle[1], noradId)) throw new Error(`CelesTrak: TLE inválido para ${noradId}`);
  return tle;
}

/** Nunca lanza: cada satélite cae a su TLE embebido si CelesTrak falla. */
export async function getTles(): Promise<TleSet> {
  const results = await Promise.allSettled(SATELLITES.map((s) => fetchTle(s.norad_id)));
  const entries: TleEntry[] = [];
  const satellites: TleSet["satellites"] = [];
  let live = 0;
  let fallback = 0;
  SATELLITES.forEach((s, i) => {
    const r = results[i];
    const ok = r.status === "fulfilled";
    const lines = ok ? r.value : TLE_FALLBACK[s.norad_id];
    if (!lines) return;
    if (ok) live += 1;
    else fallback += 1;
    entries.push({ satellite: s.name, instrument: s.instrument, line1: lines[0], line2: lines[1] });
    satellites.push({
      satellite: s.name,
      norad_id: s.norad_id,
      tle_epoch: tleEpoch(lines[0]),
      source: ok ? "celestrak" : "embedded-fallback",
    });
  });
  const tle_source: TleSource =
    fallback === 0 ? "celestrak" : live === 0 ? "embedded-fallback" : "celestrak+embedded-fallback";
  return {
    tle_source,
    entries,
    satellites,
    ...(fallback > 0
      ? {
          degraded: true as const,
          note: `CelesTrak no disponible para ${fallback} satélite(s); se usan TLE embebidos del ${TLE_FALLBACK_DATE} (los horarios pueden correrse si son viejos).`,
        }
      : {}),
  };
}
