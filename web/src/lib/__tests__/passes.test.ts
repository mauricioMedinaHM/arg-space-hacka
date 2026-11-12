import { describe, expect, it } from "vitest";
import { twoline2satrec } from "satellite.js";
import {
  SALTA_OBSERVER,
  SATELLITES,
  clampHours,
  computePasses,
  elevationDeg,
  isValidTle,
  parseTleText,
  tleEpoch,
  type TleEntry,
} from "../server/passes";
import { TLE_FALLBACK } from "../server/tle-fallback";

const TLES: TleEntry[] = SATELLITES.map((s) => ({
  satellite: s.name,
  instrument: s.instrument,
  line1: TLE_FALLBACK[s.norad_id][0],
  line2: TLE_FALLBACK[s.norad_id][1],
}));
// Cerca de la época de los TLE embebidos (2026-11-12) para que SGP4 sea preciso.
const FROM = new Date("2026-11-12T12:00:00Z");

describe("TLE embebidos", () => {
  it("hay un TLE válido por satélite", () => {
    for (const s of SATELLITES) {
      const [l1, l2] = TLE_FALLBACK[s.norad_id];
      expect(isValidTle(l1, l2, s.norad_id)).toBe(true);
    }
  });
  it("tleEpoch lee la época de la línea 1", () => {
    expect(tleEpoch(TLE_FALLBACK[43013][0]).slice(0, 10)).toBe("2026-11-12");
  });
  it("parseTleText acepta el formato de CelesTrak con nombre y rechaza basura", () => {
    const [l1, l2] = TLE_FALLBACK[43013];
    expect(parseTleText(`NOAA 20 (JPSS-1)        \r\n${l1}\r\n${l2}\r\n`)).toEqual([l1, l2]);
    expect(parseTleText("No GP data found")).toBeNull();
    expect(isValidTle(l1, TLE_FALLBACK[54234][1])).toBe(false);
  });
});

describe("computePasses", () => {
  const passes = computePasses(TLES, SALTA_OBSERVER, { from: FROM, hours: 24 });

  it("cada satélite polar pasa al menos una vez sobre Salta en 24 h", () => {
    for (const s of SATELLITES) {
      const n = passes.filter((p) => p.satellite === s.name).length;
      expect(n, s.name).toBeGreaterThanOrEqual(1);
      expect(n, s.name).toBeLessThanOrEqual(6);
    }
    expect(passes.every((p) => p.instrument === (p.satellite === "Aqua" || p.satellite === "Terra" ? "MODIS" : "VIIRS"))).toBe(true);
  });

  it("ordenadas, dentro de la ventana y con start ≤ max ≤ end", () => {
    const end = FROM.getTime() + 24 * 3_600_000;
    for (let i = 0; i < passes.length; i++) {
      const p = passes[i];
      const [s, m, e] = [p.start_utc, p.max_utc, p.end_utc].map((t) => Date.parse(t));
      expect(s).toBeGreaterThanOrEqual(FROM.getTime());
      expect(e).toBeLessThanOrEqual(end);
      expect(s).toBeLessThanOrEqual(m);
      expect(m).toBeLessThanOrEqual(e);
      expect(p.duration_s).toBe((e - s) / 1000);
      // una pasada LEO a ~830/705 km sobre 10° dura menos de ~13 min
      expect(p.duration_s).toBeLessThan(13 * 60);
      expect(p.max_elevation_deg).toBeGreaterThanOrEqual(10);
      expect(p.max_elevation_deg).toBeLessThanOrEqual(90);
      if (i > 0) expect(p.start_utc >= passes[i - 1].start_utc).toBe(true);
    }
  });

  it("los bordes están en el umbral de 10° y el máximo es realmente el pico", () => {
    for (const p of passes) {
      const tle = TLES.find((t) => t.satellite === p.satellite)!;
      const rec = twoline2satrec(tle.line1, tle.line2);
      const el = (iso: string, dt = 0) => elevationDeg(rec, SALTA_OBSERVER, new Date(Date.parse(iso) + dt));
      expect(Math.abs(el(p.start_utc) - 10)).toBeLessThan(0.3);
      expect(Math.abs(el(p.end_utc) - 10)).toBeLessThan(0.3);
      expect(Math.abs(el(p.max_utc) - p.max_elevation_deg)).toBeLessThan(0.3);
      expect(el(p.max_utc)).toBeGreaterThanOrEqual(el(p.max_utc, -20_000));
      expect(el(p.max_utc)).toBeGreaterThanOrEqual(el(p.max_utc, 20_000));
    }
  });

  it("más horas → al menos las mismas pasadas; umbral más alto → menos", () => {
    const p48 = computePasses(TLES, SALTA_OBSERVER, { from: FROM, hours: 48 });
    expect(p48.length).toBeGreaterThan(passes.length);
    expect(p48.slice(0, passes.length - 1).map((p) => p.start_utc)).toEqual(
      passes.slice(0, -1).map((p) => p.start_utc),
    );
    const high = computePasses(TLES, SALTA_OBSERVER, { from: FROM, hours: 24, minElevationDeg: 45 });
    expect(high.length).toBeLessThan(passes.length);
    expect(high.every((p) => p.max_elevation_deg >= 45)).toBe(true);
  });

  it("una ventana que arranca en plena pasada la reporta desde `from`", () => {
    const mid = new Date(passes[0].max_utc);
    const p = computePasses(TLES, SALTA_OBSERVER, { from: mid, hours: 1 }).find(
      (x) => x.satellite === passes[0].satellite,
    )!;
    expect(p.start_utc).toBe(mid.toISOString());
    expect(p.end_utc).toBe(passes[0].end_utc);
  });

  it("in_swath según el barrido del instrumento (VIIRS ≥ 20°, MODIS ≥ 24,5°)", () => {
    for (const p of passes) {
      expect(p.in_swath).toBe(p.max_elevation_deg >= (p.instrument === "VIIRS" ? 20 : 24.5));
    }
    expect(passes.some((p) => p.in_swath)).toBe(true);
  });

  it("TLE corrupto no rompe el cálculo", () => {
    const bad: TleEntry = { satellite: "Terra", instrument: "MODIS", line1: "1 basura", line2: "2 basura" };
    expect(() => computePasses([bad], SALTA_OBSERVER, { from: FROM, hours: 2 })).not.toThrow();
  });
});

describe("clampHours", () => {
  it("default 24, máximo 48, mínimo 1", () => {
    expect(clampHours(undefined)).toBe(24);
    expect(clampHours("abc")).toBe(24);
    expect(clampHours("")).toBe(24);
    expect(clampHours(null)).toBe(24);
    expect(clampHours("72")).toBe(48);
    expect(clampHours("0")).toBe(1);
    expect(clampHours("6")).toBe(6);
  });
});
