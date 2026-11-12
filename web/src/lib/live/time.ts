// Lógica pura de tiempo para el monitor en vivo (sin React, testeable).
import type { FireDetection } from "../types";
import type { SatPass } from "./types";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "hace 4 min". Valores futuros o de menos de 10 s se muestran como "recién". */
export function relativeTime(thenMs: number, nowMs: number): string {
  if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) return "—";
  const s = Math.floor((nowMs - thenMs) / 1000);
  if (s < 10) return "recién";
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rest = m % 60;
    return rest ? `hace ${h} h ${rest} min` : `hace ${h} h`;
  }
  return `hace ${plural(Math.floor(h / 24), "día", "días")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Cuenta regresiva: "04:32" debajo de una hora, "1:04:32" por encima. Nunca negativa. */
export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Instante UTC (ms) de una detección FIRMS: acq_date (YYYY-MM-DD) + acq_time (HHMM). NaN si es inválida. */
export function detectionTime(d: Pick<FireDetection, "acq_date" | "acq_time">): number {
  const t = (d.acq_time ?? "").padStart(4, "0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.acq_date ?? "") || !/^\d{4}$/.test(t)) return NaN;
  return Date.parse(`${d.acq_date}T${t.slice(0, 2)}:${t.slice(2)}:00Z`);
}

export const SALTA_TZ = "America/Argentina/Salta";

const fmt = (timeZone: string, withDate: boolean, seconds = false) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    ...(withDate ? { day: "2-digit", month: "2-digit" } : {}),
  });

const F = {
  utcDate: fmt("UTC", true),
  utcTime: fmt("UTC", false),
  saltaDate: fmt(SALTA_TZ, true),
  saltaTime: fmt(SALTA_TZ, false),
  saltaClock: fmt(SALTA_TZ, false, true),
};

const safe = (f: Intl.DateTimeFormat, ms: number) => (Number.isFinite(ms) ? f.format(ms).replace(",", "") : "—");

/** "12/11 17:42 UTC" */
export const formatUtc = (ms: number, withDate = true) =>
  Number.isFinite(ms) ? `${safe(withDate ? F.utcDate : F.utcTime, ms)} UTC` : "—";
/** Hora local de Salta (UTC−3, sin horario de verano): "12/11 14:42" */
export const formatSalta = (ms: number, withDate = true) => safe(withDate ? F.saltaDate : F.saltaTime, ms);
/** "14:42:07" hora de Salta */
export const formatSaltaClock = (ms: number) => safe(F.saltaClock, ms);

/** Espera exponencial con tope para reintentos: 2 s, 4 s, 8 s… hasta 60 s. */
export function backoffMs(attempt: number, baseMs = 2000, maxMs = 60000): number {
  const a = Math.max(0, Math.floor(attempt) || 0);
  return Math.min(maxMs, baseMs * 2 ** Math.min(a, 20));
}

/** Normaliza `next_poll_s` del servidor a un intervalo razonable (15 s a 1 h; 5 min si falta). */
export function pollDelayMs(nextPollS: unknown, fallbackS = 300): number {
  const n = typeof nextPollS === "number" && Number.isFinite(nextPollS) && nextPollS > 0 ? nextPollS : fallbackS;
  return Math.min(3600, Math.max(15, n)) * 1000;
}

export type PassState = "upcoming" | "active" | "past";

export function passState(p: Pick<SatPass, "start_utc" | "end_utc">, nowMs: number): PassState {
  const start = Date.parse(p.start_utc);
  const end = Date.parse(p.end_utc);
  if (nowMs < start) return "upcoming";
  return nowMs <= end ? "active" : "past";
}

/** Pasadas que no terminaron, ordenadas por inicio. Descarta fechas inválidas. */
export function upcomingPasses<T extends SatPass>(passes: T[], nowMs: number): T[] {
  return passes
    .filter((p) => Number.isFinite(Date.parse(p.start_utc)) && Number.isFinite(Date.parse(p.end_utc)))
    .filter((p) => passState(p, nowMs) !== "past")
    .sort((a, b) => Date.parse(a.start_utc) - Date.parse(b.start_utc));
}
