// Meteorología actual de Open-Meteo (sin clave) para puntos de Salta + índice de peligro.
import "server-only";
import { cacheLife } from "next/cache";
import { computeFireRisk, countDryDays, type FireRisk } from "./fire-risk";

export const WEATHER_POINTS = [
  { name: "Cafayate", lat: -26.07, lon: -65.97 },
  { name: "Salta capital", lat: -24.79, lon: -65.41 },
  { name: "Orán", lat: -23.13, lon: -64.32 },
  { name: "Tartagal", lat: -22.52, lon: -63.8 },
  { name: "J. V. González (Anta)", lat: -25.12, lon: -64.13 },
  { name: "Rosario de la Frontera", lat: -25.8, lon: -64.97 },
] as const;

export interface WeatherPoint {
  name: string;
  lat: number;
  lon: number;
  temperature_c: number;
  humidity_pct: number;
  wind_kmh: number;
  wind_dir_deg: number;
  gusts_kmh: number;
  precipitation_mm: number;
  fire_risk: FireRisk;
  risk_score: number;
  /** Extras (no están en el contrato mínimo). */
  dry_days: number;
  precipitation_7d_mm: number;
  observed_at: string;
}

export interface WeatherResponse {
  fetched_at: string;
  source: "open-meteo";
  points: WeatherPoint[];
  risk_note: string;
  /** Puntos omitidos por datos incompletos de Open-Meteo (el resto es válido). */
  missing_points?: string[];
  degraded?: true;
  note?: string;
}

export const RISK_NOTE =
  "Índice indicativo, no oficial: 0-100 según temperatura, humedad relativa, viento/ráfagas y días sin lluvia.";

export function openMeteoUrl(): string {
  const q = new URLSearchParams({
    latitude: WEATHER_POINTS.map((p) => p.lat).join(","),
    longitude: WEATHER_POINTS.map((p) => p.lon).join(","),
    current: "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation",
    daily: "precipitation_sum",
    past_days: "7",
    forecast_days: "1",
    timezone: "America/Argentina/Salta",
  });
  // Open-Meteo espera las comas sin codificar
  return `https://api.open-meteo.com/v1/forecast?${q.toString().replace(/%2C/g, ",").replace(/%2F/g, "/")}`;
}

interface OpenMeteoLocation {
  utc_offset_seconds?: number;
  current?: Record<string, number | string | null>;
  daily?: { time?: string[]; precipitation_sum?: Array<number | null> };
}

const n = (v: unknown): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Open-Meteo: valor actual faltante");
  return v;
};

/**
 * Convierte la respuesta multi-ubicación de Open-Meteo. Un punto con datos incompletos se
 * omite (va a `missing`) sin afectar a los demás. Lanza si la forma general no es la esperada
 * o si no quedó ningún punto válido.
 */
export function parseOpenMeteoPartial(json: unknown): { points: WeatherPoint[]; missing: string[] } {
  const list = (Array.isArray(json) ? json : [json]) as OpenMeteoLocation[];
  if (list.length !== WEATHER_POINTS.length) {
    throw new Error(`Open-Meteo: se esperaban ${WEATHER_POINTS.length} ubicaciones, llegaron ${list.length}`);
  }
  const points: WeatherPoint[] = [];
  const missing: string[] = [];
  list.forEach((loc, i) => {
    const p = WEATHER_POINTS[i];
    try {
      const c = loc?.current;
      if (!c) throw new Error("Open-Meteo: falta `current`");
      const daily = loc.daily?.precipitation_sum ?? [];
      const base = {
        temperature_c: n(c.temperature_2m),
        humidity_pct: n(c.relative_humidity_2m),
        wind_kmh: n(c.wind_speed_10m),
        wind_dir_deg: n(c.wind_direction_10m),
        gusts_kmh: n(c.wind_gusts_10m),
        precipitation_mm: n(c.precipitation),
      };
      const dry_days = countDryDays(daily, true);
      const risk = computeFireRisk({ ...base, dry_days });
      // `current.time` viene en hora local sin offset → se normaliza a ISO UTC
      const off = loc.utc_offset_seconds ?? 0;
      const t = typeof c.time === "string" ? Date.parse(`${c.time}:00Z`) - off * 1000 : NaN;
      points.push({
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        ...base,
        fire_risk: risk.fire_risk,
        risk_score: risk.risk_score,
        dry_days,
        precipitation_7d_mm:
          Math.round(daily.slice(0, -1).reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0) * 10) / 10,
        observed_at: Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(),
      });
    } catch {
      missing.push(p.name);
    }
  });
  if (points.length === 0) throw new Error("Open-Meteo: ningún punto con datos completos");
  return { points, missing };
}

/** Solo los puntos válidos (ver `parseOpenMeteoPartial`). */
export function parseOpenMeteo(json: unknown): WeatherPoint[] {
  return parseOpenMeteoPartial(json).points;
}

/** Lanza si Open-Meteo falla (los errores no se cachean). Caché ~10 min. */
async function fetchWeather(): Promise<WeatherResponse> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  const res = await fetch(openMeteoUrl(), { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const { points, missing } = parseOpenMeteoPartial(await res.json());
  return {
    fetched_at: new Date().toISOString(),
    source: "open-meteo",
    points,
    risk_note: RISK_NOTE,
    ...(missing.length > 0
      ? { missing_points: missing, note: `Sin datos completos de Open-Meteo para: ${missing.join(", ")}.` }
      : {}),
  };
}

/** Nunca lanza: si Open-Meteo falla devuelve `points: []` con `degraded`. */
export async function getWeather(): Promise<WeatherResponse> {
  try {
    return await fetchWeather();
  } catch (e) {
    return {
      fetched_at: new Date().toISOString(),
      source: "open-meteo",
      points: [],
      risk_note: RISK_NOTE,
      degraded: true,
      note: `Open-Meteo no disponible: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
