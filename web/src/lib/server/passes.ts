// Cálculo de pasadas de satélites sobre un observador (SGP4 vía satellite.js).
// Módulo puro (sin red ni Next): los TLE entran por parámetro.
import { ecfToLookAngles, eciToEcf, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";

export type SatelliteName = "NOAA-20" | "NOAA-21" | "Suomi NPP" | "Aqua" | "Terra";

export const SATELLITES: ReadonlyArray<{ name: SatelliteName; norad_id: number; instrument: "VIIRS" | "MODIS" }> = [
  { name: "NOAA-20", norad_id: 43013, instrument: "VIIRS" },
  { name: "NOAA-21", norad_id: 54234, instrument: "VIIRS" },
  { name: "Suomi NPP", norad_id: 37849, instrument: "VIIRS" },
  { name: "Aqua", norad_id: 27424, instrument: "MODIS" },
  { name: "Terra", norad_id: 25994, instrument: "MODIS" },
];

export const SALTA_OBSERVER = { name: "Salta", lat: -24.79, lon: -65.41, height_km: 1.187 } as const;

export interface Observer {
  lat: number;
  lon: number;
  height_km?: number;
}

export interface TleEntry {
  satellite: SatelliteName;
  instrument: "VIIRS" | "MODIS";
  line1: string;
  line2: string;
}

export interface Pass {
  satellite: SatelliteName;
  instrument: "VIIRS" | "MODIS";
  /** Cruce ascendente de la elevación mínima (o inicio de la ventana si ya estaba en pasada). */
  start_utc: string;
  max_utc: string;
  /** Cruce descendente de la elevación mínima (o fin de la ventana). */
  end_utc: string;
  max_elevation_deg: number;
  duration_s: number;
  /** true si el observador queda dentro del barrido del instrumento (la pasada lo observa). */
  in_swath: boolean;
}

export interface PassOptions {
  from?: Date;
  hours?: number;
  minElevationDeg?: number;
  stepSeconds?: number;
}

export const DEFAULT_HOURS = 24;
export const MAX_HOURS = 48;
export const MIN_ELEVATION_DEG = 10;
/**
 * Elevación mínima (vista desde el punto) para que el punto caiga dentro del barrido del
 * instrumento: VIIRS 3060 km de ancho a ~833 km → ~20°; MODIS 2330 km a ~705 km → ~24,5°.
 * (geometría esférica: tan(el) = (cos c − R/(R+h)) / sin c, con c = semiancho / R).
 */
export const SWATH_MIN_ELEVATION_DEG = { VIIRS: 20, MODIS: 24.5 } as const;

const RAD = Math.PI / 180;

export function clampHours(raw: unknown): number {
  if (raw === null || raw === undefined || String(raw).trim() === "") return DEFAULT_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_HOURS;
  return Math.min(MAX_HOURS, Math.max(1, n));
}

/** Valida forma básica de un TLE (dos líneas de 69 caracteres, mismo NORAD id). */
export function isValidTle(line1: string, line2: string, noradId?: number): boolean {
  if (!/^1 [ 0-9A-Z]{5}/.test(line1) || !/^2 [ 0-9A-Z]{5}/.test(line2)) return false;
  if (line1.length < 68 || line2.length < 68) return false;
  if (line1.slice(2, 7) !== line2.slice(2, 7)) return false;
  if (noradId !== undefined && Number(line1.slice(2, 7)) !== noradId) return false;
  return true;
}

/** Extrae las dos líneas de un TLE en texto (con o sin línea de nombre). */
export function parseTleText(text: string): [string, string] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const l1 = lines.find((l) => l.startsWith("1 "));
  const l2 = lines.find((l) => l.startsWith("2 "));
  return l1 && l2 && isValidTle(l1, l2) ? [l1, l2] : null;
}

/** Época del TLE (ISO UTC) a partir de la línea 1 (YYDDD.DDDDDDDD). */
export function tleEpoch(line1: string): string {
  const yy = Number(line1.slice(18, 20));
  const doy = Number(line1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86_400_000).toISOString();
}

/** Elevación (grados) del satélite vista desde el observador; -90 si SGP4 falla. */
export function elevationDeg(satrec: SatRec, observer: Observer, date: Date): number {
  const pv = propagate(satrec, date);
  if (!pv || !pv.position) return -90;
  const ecf = eciToEcf(pv.position, gstime(date));
  const look = ecfToLookAngles(
    { latitude: observer.lat * RAD, longitude: observer.lon * RAD, height: observer.height_km ?? 0 },
    ecf,
  );
  return Number.isFinite(look.elevation) ? look.elevation / RAD : -90;
}

/**
 * Pasadas con elevación máxima ≥ `minElevationDeg` en [from, from + hours].
 * Barrido cada `stepSeconds` (30 s) y refinamiento: bisección de los cruces del umbral
 * (≈1 s) y búsqueda ternaria del máximo. Devuelve ordenado por `start_utc`.
 */
export function computePasses(tles: TleEntry[], observer: Observer, opts: PassOptions = {}): Pass[] {
  const from = opts.from ?? new Date();
  const hours = clampHours(opts.hours);
  const minEl = opts.minElevationDeg ?? MIN_ELEVATION_DEG;
  const stepMs = Math.max(1, opts.stepSeconds ?? 30) * 1000;
  const t0 = from.getTime();
  const t1 = t0 + hours * 3_600_000;
  const out: Pass[] = [];

  for (const tle of tles) {
    let satrec: SatRec;
    try {
      satrec = twoline2satrec(tle.line1, tle.line2);
    } catch {
      continue;
    }
    const el = (ms: number) => elevationDeg(satrec, observer, new Date(ms));

    /** Cruce del umbral entre lo (un lado) y hi (el otro), precisión ~0,5 s. */
    const crossing = (lo: number, hi: number, risingEdge: boolean) => {
      while (hi - lo > 500) {
        const mid = (lo + hi) / 2;
        if (el(mid) >= minEl === risingEdge) hi = mid;
        else lo = mid;
      }
      return (lo + hi) / 2;
    };
    const peak = (lo: number, hi: number) => {
      while (hi - lo > 500) {
        const a = lo + (hi - lo) / 3;
        const b = hi - (hi - lo) / 3;
        if (el(a) < el(b)) lo = a;
        else hi = b;
      }
      const t = (lo + hi) / 2;
      return { t, elevation: el(t) };
    };
    const push = (start: number, end: number) => {
      const p = peak(start, end);
      const maxEl = Math.round(p.elevation * 10) / 10;
      const s = Math.round(start / 1000) * 1000;
      const e = Math.round(end / 1000) * 1000;
      out.push({
        satellite: tle.satellite,
        instrument: tle.instrument,
        start_utc: new Date(s).toISOString(),
        max_utc: new Date(Math.round(p.t / 1000) * 1000).toISOString(),
        end_utc: new Date(e).toISOString(),
        max_elevation_deg: maxEl,
        duration_s: Math.round((e - s) / 1000),
        in_swath: maxEl >= SWATH_MIN_ELEVATION_DEG[tle.instrument],
      });
    };

    let prevT = t0;
    let above = el(t0) >= minEl;
    let start = above ? t0 : NaN;
    for (let t = t0 + stepMs; prevT < t1; t += stepMs) {
      const cur = Math.min(t, t1);
      const now = el(cur) >= minEl;
      if (now && !above) start = crossing(prevT, cur, true);
      else if (!now && above) push(start, crossing(prevT, cur, false));
      above = now;
      prevT = cur;
    }
    if (above) push(start, t1); // pasada en curso al cierre de la ventana
  }

  return out.sort((a, b) => (a.start_utc < b.start_utc ? -1 : a.start_utc > b.start_utc ? 1 : 0));
}
