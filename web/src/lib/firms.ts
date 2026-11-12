// Helpers PUROS de datos NASA FIRMS (focos activos) para la provincia de Salta.
// Sin imports de datos: este módulo entra al bundle del cliente. El snapshot (161 KB) vive en
// `./firms-historical` (`loadHistorical`), que el cliente debe cargar con `import()` dinámico.
import type { FireDetection } from "./types";

/** Rectángulo aproximado de la provincia de Salta (grados decimales, WGS84). */
export const SALTA_BBOX = {
  west: -68.6,
  south: -26.5,
  east: -62.3,
  north: -22.0,
} as const;

export function inSalta(d: Pick<FireDetection, "latitude" | "longitude">): boolean {
  return (
    d.latitude >= SALTA_BBOX.south &&
    d.latitude <= SALTA_BBOX.north &&
    d.longitude >= SALTA_BBOX.west &&
    d.longitude <= SALTA_BBOX.east
  );
}

const SATELLITES: Record<string, FireDetection["satellite"]> = {
  N: "N",
  NPP: "N",
  "1": "N20",
  N20: "N20",
  J1: "N20",
  "NOAA-20": "N20",
  "2": "N21",
  N21: "N21",
  J2: "N21",
  "NOAA-21": "N21",
  T: "Terra",
  TERRA: "Terra",
  A: "Aqua",
  AQUA: "Aqua",
};

/** VIIRS: l/n/h o low/nominal/high. MODIS: 0-100 → <30 l, 30-79 n, >=80 h. */
export function mapConfidence(raw: string): FireDetection["confidence"] {
  const c = raw.trim().toLowerCase();
  if (c === "l" || c === "low") return "l";
  if (c === "h" || c === "high") return "h";
  if (c === "n" || c === "nominal") return "n";
  const num = Number(c);
  if (c !== "" && Number.isFinite(num)) return num < 30 ? "l" : num < 80 ? "n" : "h";
  return "n";
}

export function detectionId(
  d: Pick<FireDetection, "satellite" | "acq_date" | "acq_time" | "latitude" | "longitude">,
): string {
  return `${d.satellite}-${d.acq_date}-${d.acq_time}-${d.latitude}-${d.longitude}`;
}

const num = (v: string | undefined): number => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : 0;
};

/**
 * Parsea un CSV de FIRMS (VIIRS o MODIS, del área API o de los CSV públicos).
 * - Resuelve columnas por nombre de encabezado (el orden y la presencia de `instrument` varían).
 * - MODIS: `brightness` → bright_ti4, `bright_t31` → bright_ti5, confianza numérica → l/n/h.
 * - Filas inválidas (sin lat/lon/fecha o satélite desconocido) se descartan sin lanzar.
 * - Respuestas que no son CSV (p. ej. "Invalid MAP_KEY.") devuelven [].
 * - `fallbackSatellite`: satélite a asumir si la fila no lo trae o no se reconoce.
 */
export function parseFirmsCsv(
  csv: string,
  source: FireDetection["source"] = "firms-live",
  fallbackSatellite?: FireDetection["satellite"],
): FireDetection[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  if (!head.includes("latitude") || !head.includes("longitude")) return [];

  const out: FireDetection[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const r: Record<string, string> = {};
    head.forEach((h, j) => (r[h] = (cells[j] ?? "").trim()));

    const hasModisCols = "brightness" in r && !("bright_ti4" in r);
    const instrRaw = (r.instrument ?? "").toUpperCase();
    const satellite =
      SATELLITES[(r.satellite ?? "").toUpperCase()] ??
      // el área API a veces omite el satélite: se usa el del producto consultado
      // (p. ej. VIIRS_NOAA21_NRT → "N21") o, en su defecto, se infiere del instrumento
      fallbackSatellite ??
      (instrRaw === "VIIRS" ? "N" : undefined);
    if (!satellite) continue;
    if (r.latitude === "" || r.longitude === "") continue;
    const latitude = Number(r.latitude);
    const longitude = Number(r.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.acq_date ?? "")) continue;

    const modis = satellite === "Terra" || satellite === "Aqua" || instrRaw === "MODIS" || hasModisCols;
    const acq_time = (r.acq_time ?? "").replace(/\D/g, "").padStart(4, "0").slice(-4);
    const base = { satellite, acq_date: r.acq_date, acq_time, latitude, longitude };
    out.push({
      id: detectionId(base),
      latitude,
      longitude,
      bright_ti4: num(modis ? r.brightness ?? r.bright_ti4 : r.bright_ti4),
      bright_ti5: num(modis ? r.bright_t31 ?? r.bright_ti5 : r.bright_ti5),
      frp: num(r.frp),
      scan: num(r.scan),
      track: num(r.track),
      acq_date: r.acq_date,
      acq_time,
      satellite,
      instrument: modis ? "MODIS" : "VIIRS",
      confidence: mapConfidence(r.confidence ?? ""),
      daynight: (r.daynight ?? "").toUpperCase() === "N" ? "N" : "D",
      source,
    });
  }
  return out;
}

/** Une varias listas quitando duplicados por `id` (gana la primera aparición) y ordena. */
export function mergeDetections(...lists: FireDetection[][]): FireDetection[] {
  const byId = new Map<string, FireDetection>();
  for (const list of lists) for (const d of list) if (!byId.has(d.id)) byId.set(d.id, d);
  return sortDetections([...byId.values()]);
}

/** Orden cronológico estable (acq_date + acq_time, luego id). */
export function sortDetections(dets: FireDetection[]): FireDetection[] {
  const key = (d: FireDetection) => `${d.acq_date}${d.acq_time}${d.satellite}${d.id}`;
  return [...dets].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Parte las detecciones en lotes consecutivos de `size` (el último puede ser menor). */
export function toBatches(dets: FireDetection[], size: number): FireDetection[][] {
  const n = Math.max(1, Math.floor(size) || 1);
  const out: FireDetection[][] = [];
  for (let i = 0; i < dets.length; i += n) out.push(dets.slice(i, i + n));
  return out;
}
