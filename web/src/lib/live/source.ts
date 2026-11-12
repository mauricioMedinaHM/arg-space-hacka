// Etiquetas honestas del origen de datos y helpers de presentación (puros).
import type { FireDetection } from "../types";
import type { FireRisk } from "./types";

export interface SourceInfo {
  /** true sólo si los focos vienen de FIRMS en este ciclo (no de un snapshot). */
  live: boolean;
  short: string;
  label: string;
}

export function describeSource(source: string | undefined, origin: string | undefined): SourceInfo {
  if (source === "firms-live") {
    if (origin === "firms-area-api") {
      return { live: true, short: "FIRMS área API", label: "NASA FIRMS · área API (VIIRS + MODIS, tiempo casi real)" };
    }
    if (origin === "firms-public-24h") {
      return { live: true, short: "FIRMS público 24 h", label: "NASA FIRMS · CSV públicos de las últimas 24 h (VIIRS)" };
    }
    return { live: true, short: "FIRMS", label: `NASA FIRMS${origin ? ` · ${origin}` : ""}` };
  }
  if (source === "historical" || origin === "local-snapshot") {
    return {
      live: false,
      short: "Snapshot local",
      label: "Snapshot local congelado: FIRMS no respondió. No son datos en vivo.",
    };
  }
  return {
    live: false,
    short: source || "desconocido",
    label: `Origen no reconocido (${[source, origin].filter(Boolean).join(" / ") || "sin datos"}). Tratalo como no en vivo.`,
  };
}

export const SATELLITE_NAME: Record<FireDetection["satellite"], string> = {
  N: "Suomi NPP",
  N20: "NOAA-20",
  N21: "NOAA-21",
  Terra: "Terra",
  Aqua: "Aqua",
};

export const CONFIDENCE_LABEL: Record<FireDetection["confidence"], string> = {
  l: "baja",
  n: "nominal",
  h: "alta",
};

/** Rampa de color por FRP (MW): amarillo → naranja → rojo-naranja → blanco incandescente. */
export const FRP_STOPS: [number, string][] = [
  [0, "#ffd166"],
  [10, "#ff9330"],
  [30, "#ff5a1f"],
  [80, "#fff1e0"],
];

export type RiskTone = "ok" | "cyan" | "amber" | "fire" | "bad";

export const RISK_ORDER: FireRisk[] = ["bajo", "moderado", "alto", "muy alto", "extremo"];

export function riskTone(risk: string): RiskTone {
  switch (risk) {
    case "bajo":
      return "ok";
    case "moderado":
      return "cyan";
    case "alto":
      return "amber";
    case "muy alto":
      return "fire";
    case "extremo":
      return "bad";
    default:
      return "cyan";
  }
}

const ROSE = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

/** Rumbo de 8 puntos desde el que sopla el viento (convención meteorológica). */
export function compass(deg: number): string {
  if (!Number.isFinite(deg)) return "—";
  return ROSE[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export interface LiveTotals {
  count: number;
  frp: number;
  high: number;
  latestMs: number | null;
}

/** KPIs sobre un conjunto de detecciones (sólo las aceptadas por el verificador). */
export function totals(dets: Pick<FireDetection, "frp" | "confidence" | "acq_date" | "acq_time">[], timeOf: (d: Pick<FireDetection, "acq_date" | "acq_time">) => number): LiveTotals {
  let frp = 0;
  let high = 0;
  let latest: number | null = null;
  for (const d of dets) {
    frp += Number.isFinite(d.frp) ? d.frp : 0;
    if (d.confidence === "h") high += 1;
    const t = timeOf(d);
    if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
  }
  return { count: dets.length, frp: +frp.toFixed(1), high, latestMs: latest };
}
