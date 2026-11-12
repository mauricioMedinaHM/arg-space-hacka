import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {} }));

import { WEATHER_POINTS, getWeather, openMeteoUrl, parseOpenMeteo } from "../server/weather";

const loc = (t: number, rh: number, wind: number, daily: number[]) => ({
  utc_offset_seconds: -10800,
  current: {
    time: "2026-11-12T11:00",
    temperature_2m: t,
    relative_humidity_2m: rh,
    wind_speed_10m: wind,
    wind_direction_10m: 309,
    wind_gusts_10m: wind * 2,
    precipitation: 0,
  },
  daily: { precipitation_sum: daily },
});
const SAMPLE = WEATHER_POINTS.map((_, i) => loc(20 + i * 3, 60 - i * 8, 5 + i * 5, [0, 0.2, 0, 0, 0, 1.9, 0, 0]));

afterEach(() => vi.unstubAllGlobals());

describe("weather", () => {
  it("la URL pide las 6 ubicaciones en una sola llamada", () => {
    const u = openMeteoUrl();
    expect(u).toContain("latitude=-26.07,-24.79,-23.13,-22.52,-25.12,-25.8");
    expect(u).toContain("past_days=7");
    expect(u).toContain("timezone=America/Argentina/Salta");
  });

  it("parseOpenMeteo arma los puntos del contrato con riesgo creciente", () => {
    const pts = parseOpenMeteo(SAMPLE);
    expect(pts.map((p) => p.name)).toEqual(WEATHER_POINTS.map((p) => p.name));
    expect(pts[0]).toMatchObject({
      name: "Cafayate",
      lat: -26.07,
      lon: -65.97,
      temperature_c: 20,
      humidity_pct: 60,
      wind_kmh: 5,
      wind_dir_deg: 309,
      gusts_kmh: 10,
      precipitation_mm: 0,
      dry_days: 1,
      precipitation_7d_mm: 2.1,
      observed_at: "2026-11-12T14:00:00.000Z",
    });
    const scores = pts.map((p) => p.risk_score);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
    expect(pts[0].fire_risk).toBe("bajo");
    expect(["alto", "muy alto", "extremo"]).toContain(pts[5].fire_risk);
  });

  it("forma inesperada lanza; getWeather degrada sin lanzar", async () => {
    expect(() => parseOpenMeteo({ error: true, reason: "x" })).toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 502 })));
    const r = await getWeather();
    expect(r).toMatchObject({ source: "open-meteo", points: [], degraded: true });
    expect(r.note).toContain("502");
  });

  it("un valor nulo solo descarta ese punto", async () => {
    const holed = SAMPLE.map((l, i) => (i === 2 ? { ...l, current: { ...l.current, wind_gusts_10m: null } } : l));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(holed)));
    const r = await getWeather();
    expect(r.degraded).toBeUndefined();
    expect(r.points).toHaveLength(5);
    expect(r.missing_points).toEqual(["Orán"]);
    expect(r.note).toContain("Orán");
  });

  it("getWeather devuelve los puntos cuando Open-Meteo responde", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(SAMPLE)));
    const r = await getWeather();
    expect(r.degraded).toBeUndefined();
    expect(r.points).toHaveLength(6);
  });
});
