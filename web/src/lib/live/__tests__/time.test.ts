import { describe, expect, it } from "vitest";
import { backoffMs, detectionTime, formatCountdown, formatSalta, formatUtc, passState, pollDelayMs, relativeTime, upcomingPasses } from "../time";
import { compass, describeSource, riskTone, totals } from "../source";

const T = Date.UTC(2026, 10, 12, 18, 0, 0);

describe("relativeTime", () => {
  it("cubre segundos, minutos, horas y días", () => {
    expect(relativeTime(T - 3_000, T)).toBe("recién");
    expect(relativeTime(T + 60_000, T)).toBe("recién"); // reloj del servidor adelantado
    expect(relativeTime(T - 42_000, T)).toBe("hace 42 s");
    expect(relativeTime(T - 4 * 60_000 - 59_000, T)).toBe("hace 4 min");
    expect(relativeTime(T - 3 * 3600_000, T)).toBe("hace 3 h");
    expect(relativeTime(T - (3 * 60 + 12) * 60_000, T)).toBe("hace 3 h 12 min");
    expect(relativeTime(T - 24 * 3600_000, T)).toBe("hace 1 día");
    expect(relativeTime(T - 72 * 3600_000, T)).toBe("hace 3 días");
    expect(relativeTime(NaN, T)).toBe("—");
  });
});

describe("formatCountdown", () => {
  it("formatea mm:ss y h:mm:ss, sin negativos", () => {
    expect(formatCountdown(272_000)).toBe("04:32");
    expect(formatCountdown(271_001)).toBe("04:32"); // redondea hacia arriba: nunca muestra 00:00 antes de tiempo
    expect(formatCountdown(999)).toBe("00:01");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5000)).toBe("00:00");
    expect(formatCountdown(3_872_000)).toBe("1:04:32");
    expect(formatCountdown(NaN)).toBe("—");
  });
});

describe("detectionTime y formatos", () => {
  it("combina acq_date + acq_time en UTC y convierte a hora de Salta (UTC−3)", () => {
    const t = detectionTime({ acq_date: "2026-11-12", acq_time: "0437" });
    expect(t).toBe(Date.UTC(2026, 10, 12, 4, 37));
    expect(formatUtc(t)).toBe("12/11 04:37 UTC");
    expect(formatSalta(t)).toBe("12/11 01:37");
    expect(formatSalta(t, false)).toBe("01:37");
    expect(detectionTime({ acq_date: "2026-11-12", acq_time: "437" })).toBe(t);
  });
  it("devuelve NaN con datos corruptos", () => {
    expect(detectionTime({ acq_date: "12/11/2026", acq_time: "0437" })).toBeNaN();
    expect(detectionTime({ acq_date: "2026-11-12", acq_time: "ab" })).toBeNaN();
    expect(formatUtc(NaN)).toBe("—");
  });
});

describe("reconexión", () => {
  it("backoff exponencial con tope", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map((a) => backoffMs(a))).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
    expect(backoffMs(-3)).toBe(2000);
  });
  it("normaliza next_poll_s", () => {
    expect(pollDelayMs(60)).toBe(60_000);
    expect(pollDelayMs(1)).toBe(15_000);
    expect(pollDelayMs(99_999)).toBe(3_600_000);
    expect(pollDelayMs(undefined)).toBe(300_000);
    expect(pollDelayMs("60")).toBe(300_000);
    expect(pollDelayMs(-4)).toBe(300_000);
  });
});

describe("pasadas", () => {
  const mk = (satellite: string, startMin: number, endMin: number) => ({
    satellite,
    instrument: "VIIRS",
    start_utc: new Date(T + startMin * 60_000).toISOString(),
    max_utc: new Date(T + ((startMin + endMin) / 2) * 60_000).toISOString(),
    end_utc: new Date(T + endMin * 60_000).toISOString(),
    max_elevation_deg: 40,
  });
  it("clasifica y ordena, descartando las terminadas y las inválidas", () => {
    const list = [mk("NOAA-21", 90, 100), mk("Aqua", -30, -20), mk("NOAA-20", -2, 6), { ...mk("Terra", 5, 9), start_utc: "x" }];
    expect(passState(list[0], T)).toBe("upcoming");
    expect(passState(list[1], T)).toBe("past");
    expect(passState(list[2], T)).toBe("active");
    expect(upcomingPasses(list, T).map((p) => p.satellite)).toEqual(["NOAA-20", "NOAA-21"]);
  });
});

describe("origen y presentación", () => {
  it("sólo marca en vivo lo que viene de FIRMS", () => {
    expect(describeSource("firms-live", "firms-area-api").live).toBe(true);
    expect(describeSource("firms-live", "firms-public-24h").live).toBe(true);
    expect(describeSource("historical", "local-snapshot").live).toBe(false);
    expect(describeSource("historical", "local-snapshot").label).toMatch(/No son datos en vivo/);
    expect(describeSource(undefined, undefined).live).toBe(false);
    expect(describeSource("otra-cosa", "x").live).toBe(false);
  });
  it("rumbo, tono de riesgo y totales", () => {
    expect([0, 44, 90, 200, 315, 359, -45].map(compass)).toEqual(["N", "NE", "E", "S", "NO", "N", "NO"]);
    expect(riskTone("extremo")).toBe("bad");
    expect(riskTone("bajo")).toBe("ok");
    const dets = [
      { frp: 10.25, confidence: "h" as const, acq_date: "2026-11-12", acq_time: "0437" },
      { frp: 2.5, confidence: "n" as const, acq_date: "2026-11-12", acq_time: "1710" },
      { frp: NaN, confidence: "h" as const, acq_date: "mal", acq_time: "" },
    ];
    expect(totals(dets, detectionTime)).toEqual({ count: 3, frp: 12.8, high: 2, latestMs: Date.UTC(2026, 10, 12, 17, 10) });
    expect(totals([], detectionTime)).toEqual({ count: 0, frp: 0, high: 0, latestMs: null });
  });
});
