#!/usr/bin/env node
// Genera web/src/data/firms-salta.json (+ .meta.json).
//   a) Detecciones REALES de NASA FIRMS (VIIRS C2, CSV públicos de 7 días, Sudamérica)
//      recortadas al bbox de Salta → source "historical" (snapshot congelado).
//   b) Escenario SINTÉTICO determinista (PRNG con semilla): incendio forestal de Cafayate
//      (jun-2026) + quemas agrícolas dispersas en el Chaco salteño → source "synthetic".
//
// Uso:  node scripts/build-firms-dataset.mjs            (descarga FIRMS)
//       node scripts/build-firms-dataset.mjs --offline  (reusa las reales ya guardadas en el JSON)
// Sin dependencias externas (Node >= 18).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../src/data");
const OUT_JSON = resolve(OUT_DIR, "firms-salta.json");
const OUT_META = resolve(OUT_DIR, "firms-salta.meta.json");

const BBOX = { west: -68.6, south: -26.5, east: -62.3, north: -22.0 };
const MAX_REAL = 400; // tope de detecciones reales (muestreo determinista si hay más)
const SEED = 0x5a17a2026; // semilla fija → sintético reproducible
const OFFLINE = process.argv.includes("--offline");

const BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire";
const REAL_SOURCES = [
  { name: "VIIRS S-NPP C2 7d", url: `${BASE}/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_7d.csv` },
  { name: "VIIRS NOAA-20 C2 7d", url: `${BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_7d.csv` },
  { name: "VIIRS NOAA-21 C2 7d", url: `${BASE}/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_America_7d.csv` },
];

// ---------- utilidades ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (x, n) => Number(x.toFixed(n));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const inBbox = (d) =>
  d.latitude >= BBOX.south && d.latitude <= BBOX.north && d.longitude >= BBOX.west && d.longitude <= BBOX.east;
const makeId = (d) => `${d.satellite}-${d.acq_date}-${d.acq_time}-${d.latitude}-${d.longitude}`;
const sortKey = (d) => `${d.acq_date}${d.acq_time}${d.satellite}${d.id}`;

// ---------- a) FIRMS real ----------
const SAT = { N: "N", "1": "N20", N20: "N20", "2": "N21", N21: "N21", T: "Terra", TERRA: "Terra", A: "Aqua", AQUA: "Aqua" };
function mapConfidence(raw) {
  const c = String(raw).trim().toLowerCase();
  if (c === "l" || c === "low") return "l";
  if (c === "h" || c === "high") return "h";
  if (c === "n" || c === "nominal") return "n";
  const num = Number(c);
  if (Number.isFinite(num)) return num < 30 ? "l" : num < 80 ? "n" : "h";
  return "n";
}
function parseCsv(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const out = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const r = Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
    const satellite = SAT[(r.satellite ?? "").toUpperCase()];
    const latitude = Number(r.latitude);
    const longitude = Number(r.longitude);
    if (!satellite || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !r.acq_date) continue;
    const modis = satellite === "Terra" || satellite === "Aqua";
    const d = {
      id: "",
      latitude,
      longitude,
      bright_ti4: Number(modis ? r.brightness : r.bright_ti4) || 0,
      bright_ti5: Number(modis ? r.bright_t31 : r.bright_ti5) || 0,
      frp: Number(r.frp) || 0,
      scan: Number(r.scan) || 0,
      track: Number(r.track) || 0,
      acq_date: r.acq_date,
      acq_time: String(r.acq_time ?? "").padStart(4, "0"),
      satellite,
      instrument: modis ? "MODIS" : "VIIRS",
      confidence: mapConfidence(r.confidence),
      daynight: (r.daynight ?? "").toUpperCase() === "N" ? "N" : "D",
      source: "historical",
    };
    d.id = makeId(d);
    out.push(d);
  }
  return out;
}

async function fetchReal() {
  const report = [];
  const all = [];
  for (const s of REAL_SOURCES) {
    try {
      const res = await fetch(s.url, { signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = parseCsv(await res.text());
      const salta = rows.filter(inBbox);
      report.push({ ...s, ok: true, rows_south_america: rows.length, rows_salta_bbox: salta.length });
      all.push(...salta);
    } catch (e) {
      report.push({ ...s, ok: false, error: String(e?.message ?? e) });
    }
  }
  return { all, report };
}

/** Muestreo determinista sin reemplazo (Fisher-Yates parcial con semilla) sobre orden estable. */
function sample(arr, n, rand) {
  if (arr.length <= n) return arr;
  const a = [...arr].sort((x, y) => (sortKey(x) < sortKey(y) ? -1 : 1));
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// ---------- b) sintético ----------
// Pasadas VIIRS típicas sobre el NOA (UTC): noche ~04:40-06:20, tarde ~17:00-18:40.
const PASSES = [
  { satellite: "N20", daynight: "N", base: 4 * 60 + 45 },
  { satellite: "N21", daynight: "N", base: 5 * 60 + 10 },
  { satellite: "N", daynight: "N", base: 5 * 60 + 35 },
  { satellite: "N20", daynight: "D", base: 17 * 60 + 5 },
  { satellite: "N21", daynight: "D", base: 17 * 60 + 30 },
  { satellite: "N", daynight: "D", base: 17 * 60 + 55 },
];
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}${String(min % 60).padStart(2, "0")}`;
const gauss = (rand) => {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

function synthDetection(rand, { lat, lon, date, pass, intensity }) {
  const day = pass.daynight === "D";
  // FRP log-normal acotado a 1..60 MW; más intenso de día y en el pico del incendio.
  const frp = clamp(Math.exp(0.9 + 1.5 * intensity + (day ? 0.5 : 0) + 0.75 * gauss(rand)), 1, 60);
  // bright_ti4 (I4, 3.74 µm): 300-367 K (367 K = saturación del canal).
  const ti4 = clamp((day ? 326 : 301) + 9.5 * Math.log(frp) + 5 * gauss(rand), 300, 367);
  // bright_ti5 (I5, 11.45 µm): fondo ~ temperatura de superficie.
  const ti5 = clamp((day ? 294 : 279) + 0.12 * (ti4 - 300) + 3 * gauss(rand), 268, 320);
  const confidence = ti4 >= 355 || frp >= 28 ? "h" : frp < 2.2 && rand() < 0.6 ? "l" : "n";
  const d = {
    id: "",
    latitude: round(lat, 5),
    longitude: round(lon, 5),
    bright_ti4: round(ti4, 2),
    bright_ti5: round(ti5, 2),
    frp: round(frp, 2),
    scan: pass.scan,
    track: pass.track,
    acq_date: date,
    acq_time: pass.time,
    satellite: pass.satellite,
    instrument: "VIIRS",
    confidence,
    daynight: pass.daynight,
    source: "synthetic",
  };
  d.id = makeId(d);
  return d;
}

function concretePass(rand, p) {
  return {
    ...p,
    time: hhmm(p.base + Math.floor(rand() * 36) - 12),
    scan: round(0.36 + rand() * 0.3, 2),
    track: round(0.38 + rand() * 0.28, 2),
  };
}

/** Incendio forestal de Cafayate: ignición 12-jun, pico 13/14-jun, control 16-jun. */
function synthCafayate(rand) {
  const origin = { lat: -26.07, lon: -65.97 };
  // intensidad 0..1 y nº medio de píxeles activos por pasada [noche, tarde];
  // centro del frente desplazándose al NE (grados) y dispersión (grados; 0.004° ≈ 440 m).
  const days = [
    { date: "2026-06-12", night: null, day: { i: 0.25, n: 2 }, dLat: 0.0, dLon: 0.0, spread: 0.003 },
    { date: "2026-06-13", night: { i: 0.45, n: 4 }, day: { i: 0.8, n: 7 }, dLat: 0.003, dLon: 0.004, spread: 0.005 },
    { date: "2026-06-14", night: { i: 0.7, n: 6 }, day: { i: 1.0, n: 8 }, dLat: 0.007, dLon: 0.009, spread: 0.007 },
    { date: "2026-06-15", night: { i: 0.5, n: 4 }, day: { i: 0.55, n: 5 }, dLat: 0.01, dLon: 0.013, spread: 0.006 },
    { date: "2026-06-16", night: { i: 0.25, n: 2 }, day: { i: 0.15, n: 1 }, dLat: 0.011, dLon: 0.015, spread: 0.004 },
  ];
  const out = [];
  for (const day of days) {
    for (const p of PASSES) {
      const phase = p.daynight === "N" ? day.night : day.day;
      if (!phase) continue;
      const pass = concretePass(rand, p);
      // humo/nubes o geometría: algunas pasadas ven menos (o nada)
      const visibility = rand() < 0.12 ? 0 : 0.6 + rand() * 0.6;
      const n = Math.round(phase.n * visibility);
      for (let k = 0; k < n; k++) {
        out.push(
          synthDetection(rand, {
            lat: origin.lat + day.dLat + day.spread * gauss(rand),
            lon: origin.lon + day.dLon + day.spread * 1.1 * gauss(rand),
            date: day.date,
            pass,
            intensity: phase.i * (0.7 + 0.5 * rand()),
          }),
        );
      }
    }
  }
  return out;
}

/** Quemas agrícolas / de desmonte dispersas en el Chaco salteño (este provincial). */
function synthChaco(rand) {
  const zones = [
    { name: "Tartagal", lat: -22.52, lon: -63.6, n: 10 },
    { name: "Orán", lat: -23.2, lon: -64.15, n: 10 },
    { name: "Anta", lat: -25.0, lon: -63.9, n: 14 },
  ];
  const dates = ["2026-06-12", "2026-06-13", "2026-06-14", "2026-06-15", "2026-06-16"];
  const dayPasses = PASSES.filter((p) => p.daynight === "D");
  const out = [];
  for (const z of zones) {
    let left = z.n;
    while (left > 0) {
      // cada quema: 1-3 píxeles contiguos en una única pasada de tarde
      const pass = concretePass(rand, dayPasses[Math.floor(rand() * dayPasses.length)]);
      const date = dates[Math.floor(rand() * dates.length)];
      const lat = z.lat + 0.22 * gauss(rand);
      const lon = z.lon + 0.25 * gauss(rand);
      const px = Math.min(left, 1 + Math.floor(rand() * 3));
      for (let k = 0; k < px; k++) {
        out.push(
          synthDetection(rand, {
            lat: lat + 0.0035 * k + 0.001 * gauss(rand),
            lon: lon + 0.002 * gauss(rand),
            date,
            pass,
            intensity: 0.1 + 0.35 * rand(),
          }),
        );
      }
      left -= px;
    }
  }
  return out.filter(inBbox);
}

// ---------- main ----------
const now = new Date().toISOString();
let real = [];
let realReport = [];
let realFetchedAt = null;
let realNote;

if (OFFLINE) {
  if (existsSync(OUT_JSON)) {
    real = JSON.parse(readFileSync(OUT_JSON, "utf8")).filter((d) => d.source === "historical");
    const prev = existsSync(OUT_META) ? JSON.parse(readFileSync(OUT_META, "utf8")) : {};
    realFetchedAt = prev.real_fetched_at ?? null;
    realReport = prev.real_fetch_report ?? [];
    realNote = prev.real_total_in_bbox ?? real.length;
  }
} else {
  const { all, report } = await fetchReal();
  realReport = report;
  const dedup = [...new Map(all.map((d) => [d.id, d])).values()];
  realNote = dedup.length;
  real = sample(dedup, MAX_REAL, mulberry32(SEED ^ 0xf1235));
  if (dedup.length > 0) realFetchedAt = now;
}

const rand = mulberry32(SEED);
const cafayate = synthCafayate(rand);
const chaco = synthChaco(rand);

const byId = new Map();
for (const d of [...real, ...cafayate, ...chaco]) byId.set(d.id, d);
const detections = [...byId.values()].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));

const counts = {};
for (const d of detections) counts[d.source] = (counts[d.source] ?? 0) + 1;
const realOk = real.length > 0;
const realDates = real.map((d) => d.acq_date).sort();

const meta = {
  generated_at: now,
  real_fetched_at: realFetchedAt,
  real_fetch_ok: realOk,
  real_total_in_bbox: realNote ?? 0,
  real_date_range: realOk ? [realDates[0], realDates[realDates.length - 1]] : null,
  real_fetch_report: realReport,
  total: detections.length,
  counts_by_source: counts,
  counts_synthetic: { cafayate_2026_06: cafayate.length, chaco_salteno: chaco.length },
  bbox: BBOX,
  sources: [
    ...REAL_SOURCES.map((s) => ({
      kind: "historical",
      name: `NASA FIRMS ${s.name} (NRT, Sudamérica)`,
      url: s.url,
    })),
    {
      kind: "synthetic",
      name: "Escenario Cafayate jun-2026 (reconstrucción sintética)",
      description:
        "Reconstrucción plausible, NO son datos satelitales reales. Basada en el incendio forestal informado por el Gobierno de Salta el 2026-06-14 (más de 50 ha de bosque nativo cerca de Cafayate, ~ -26.07, -65.97). Detecciones VIIRS simuladas del 2026-06-12 al 2026-06-16.",
      seed: SEED,
    },
    {
      kind: "synthetic",
      name: "Quemas agrícolas dispersas en el Chaco salteño (sintético)",
      description: "Focos aislados simulados cerca de Tartagal, Orán y Anta en la misma ventana de fechas.",
      seed: SEED,
    },
  ],
  notes: [
    realOk
      ? `Datos reales: snapshot congelado de NASA FIRMS (VIIRS 375 m, NRT) descargado el ${realFetchedAt}; ${realNote} detecciones dentro del bbox, de las cuales se conservan ${real.length} por muestreo determinista (tope ${MAX_REAL}). Se marcan como "historical" porque no se actualizan.`
      : "No se pudieron descargar datos reales de FIRMS al generar el dataset: contiene únicamente detecciones sintéticas.",
    'Las detecciones con source "synthetic" son simuladas con un PRNG de semilla fija (reproducibles) y sirven solo para la demo de integridad; no deben interpretarse como observaciones reales.',
    "El bbox es un rectángulo aproximado de la provincia de Salta: incluye porciones de Jujuy, Tucumán, Catamarca, Santiago del Estero, Chaco, Formosa y zonas limítrofes de Chile, Bolivia y Paraguay.",
    "Limitación FIRMS: nubes, humo denso o el dosel del bosque pueden ocultar focos activos (omisiones).",
    "Limitación FIRMS: los incendios que se inician y se apagan entre dos pasadas del satélite no se detectan.",
    "Limitación FIRMS: un foco de calor (hotspot) NO es el perímetro del incendio; indica el centro de un píxel con anomalía térmica, no el área quemada.",
    "Limitación FIRMS: los datos NRT tienen una latencia aproximada de 3 horas desde la observación.",
    "Limitación FIRMS: el píxel VIIRS es de ~375 m en el nadir (crece hacia el borde de la pasada); la posición del foco tiene esa incertidumbre.",
    "También pueden aparecer falsos positivos (superficies muy calientes, reflejos solares, actividad industrial o volcánica).",
    "La firma ML-DSA-65 garantiza integridad y autenticidad del lote transmitido, no la veracidad física de la detección.",
  ],
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(detections, null, 1) + "\n");
writeFileSync(OUT_META, JSON.stringify(meta, null, 2) + "\n");
console.log(`OK ${detections.length} detecciones →`, counts, meta.counts_synthetic);
for (const r of realReport) console.log(" ", r.name, r.ok ? `ok (${r.rows_salta_bbox} en bbox)` : `FALLÓ: ${r.error}`);
