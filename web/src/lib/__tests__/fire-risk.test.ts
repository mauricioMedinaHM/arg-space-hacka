import { describe, expect, it } from "vitest";
import { computeFireRisk, countDryDays, riskCategory } from "../server/fire-risk";

describe("computeFireRisk", () => {
  it("fresco, húmedo y calmo → bajo", () => {
    const r = computeFireRisk({ temperature_c: 12, humidity_pct: 85, wind_kmh: 3, gusts_kmh: 5, dry_days: 0 });
    expect(r.fire_risk).toBe("bajo");
    expect(r.risk_score).toBeLessThan(25);
  });

  it("caluroso, seco, ventoso y sin lluvia → extremo (100 como tope)", () => {
    const r = computeFireRisk({ temperature_c: 41, humidity_pct: 8, wind_kmh: 45, gusts_kmh: 70, dry_days: 7 });
    expect(r.risk_score).toBe(100);
    expect(r.fire_risk).toBe("extremo");
  });

  it("valor intermedio conocido", () => {
    // T: 25*(30-10)/30 = 16,67 · HR: 35*(80-30)/70 = 25 · V: 25*20/40 = 12,5 · S: 15*3/7 = 6,43 → 60,6 → 61
    const r = computeFireRisk({ temperature_c: 30, humidity_pct: 30, wind_kmh: 20, gusts_kmh: 30, dry_days: 3 });
    expect(r.risk_score).toBe(61);
    expect(r.fire_risk).toBe("alto");
    expect(r.components).toEqual({ temperature: 16.7, humidity: 25, wind: 12.5, dryness: 6.4, rain_factor: 1 });
  });

  it("es monótono: más T, menos HR, más viento y más días secos nunca bajan el puntaje", () => {
    const base = { temperature_c: 25, humidity_pct: 45, wind_kmh: 10, gusts_kmh: 15, dry_days: 2 };
    const s = computeFireRisk(base).risk_score;
    expect(computeFireRisk({ ...base, temperature_c: 35 }).risk_score).toBeGreaterThan(s);
    expect(computeFireRisk({ ...base, humidity_pct: 15 }).risk_score).toBeGreaterThan(s);
    expect(computeFireRisk({ ...base, wind_kmh: 30 }).risk_score).toBeGreaterThan(s);
    expect(computeFireRisk({ ...base, dry_days: 7 }).risk_score).toBeGreaterThan(s);
  });

  it("las ráfagas cuentan a la mitad cuando superan al viento medio", () => {
    const calm = computeFireRisk({ temperature_c: 25, humidity_pct: 45, wind_kmh: 5, gusts_kmh: 5 });
    const gusty = computeFireRisk({ temperature_c: 25, humidity_pct: 45, wind_kmh: 5, gusts_kmh: 60 });
    expect(gusty.components.wind).toBe(18.8); // 25 * 30/40
    expect(gusty.risk_score).toBeGreaterThan(calm.risk_score);
  });

  it("la lluvia actual reduce el puntaje a la mitad", () => {
    const dry = computeFireRisk({ temperature_c: 30, humidity_pct: 30, wind_kmh: 20, dry_days: 3 });
    const wet = computeFireRisk({ temperature_c: 30, humidity_pct: 30, wind_kmh: 20, dry_days: 3, precipitation_mm: 1.2 });
    expect(wet.components.rain_factor).toBe(0.5);
    expect(wet.risk_score).toBe(Math.round(60.595 / 2));
    expect(wet.risk_score).toBeLessThan(dry.risk_score);
  });

  it("entradas fuera de rango o no numéricas no rompen ni salen de 0-100", () => {
    for (const i of [
      { temperature_c: -20, humidity_pct: 150, wind_kmh: -5 },
      { temperature_c: 60, humidity_pct: -10, wind_kmh: 500, gusts_kmh: 900, dry_days: 99 },
      { temperature_c: NaN, humidity_pct: NaN, wind_kmh: NaN },
    ]) {
      const r = computeFireRisk(i);
      expect(r.risk_score).toBeGreaterThanOrEqual(0);
      expect(r.risk_score).toBeLessThanOrEqual(100);
    }
  });
});

describe("riskCategory", () => {
  it("umbrales 25 / 45 / 65 / 80", () => {
    expect([0, 24, 25, 44, 45, 64, 65, 79, 80, 100].map(riskCategory)).toEqual([
      "bajo", "bajo", "moderado", "moderado", "alto", "alto", "muy alto", "muy alto", "extremo", "extremo",
    ]);
  });
});

describe("countDryDays", () => {
  it("cuenta hacia atrás desde ayer e ignora el día en curso", () => {
    expect(countDryDays([0, 0.2, 0, 0, 0, 1.9, 0, 0])).toBe(1);
    expect(countDryDays([5, 0, 0, 0, 12])).toBe(3);
    expect(countDryDays([0, 0, 3, 0])).toBe(0);
  });
  it("tope de 7 y tolera nulos", () => {
    expect(countDryDays(new Array(12).fill(0))).toBe(7);
    expect(countDryDays([0, null, 0, 0, 9])).toBe(2);
    expect(countDryDays([])).toBe(0);
  });
});
