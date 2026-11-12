// Índice simple de peligro de incendio — INDICATIVO, NO OFICIAL.
// No reemplaza al FWI canadiense ni a los índices del SNMF/SMN. Se inspira en la lógica
// de Angström y de Hot-Dry-Windy: el peligro crece con la temperatura, la sequedad del
// aire, el viento y los días sin lluvia.
//
// risk_score (0-100) = T + HR + V + S, atenuado si está lloviendo:
//   T  (0-25): lineal de 10 °C (0) a 40 °C (25)
//   HR (0-35): lineal de 80 % (0) a 10 % (35)            ← el factor de más peso
//   V  (0-25): lineal de 0 a 40 km/h, con v = max(viento, 0,5 × ráfagas)
//   S  (0-15): días consecutivos sin lluvia (< 1 mm/día), de 0 a 7 días
//   lluvia actual ≥ 0,2 mm → score × 0,5
// Categorías: <25 bajo · <45 moderado · <65 alto · <80 muy alto · ≥80 extremo

export type FireRisk = "bajo" | "moderado" | "alto" | "muy alto" | "extremo";

export interface FireRiskInput {
  temperature_c: number;
  humidity_pct: number;
  wind_kmh: number;
  gusts_kmh?: number;
  /** Precipitación actual (mm en el intervalo vigente). */
  precipitation_mm?: number;
  /** Días consecutivos previos con < 1 mm. */
  dry_days?: number;
}

export interface FireRiskResult {
  risk_score: number;
  fire_risk: FireRisk;
  components: { temperature: number; humidity: number; wind: number; dryness: number; rain_factor: number };
}

export const DRY_DAY_THRESHOLD_MM = 1;
export const MAX_DRY_DAYS = 7;

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const round1 = (x: number) => Math.round(x * 10) / 10;

export function riskCategory(score: number): FireRisk {
  if (score < 25) return "bajo";
  if (score < 45) return "moderado";
  if (score < 65) return "alto";
  if (score < 80) return "muy alto";
  return "extremo";
}

export function computeFireRisk(i: FireRiskInput): FireRiskResult {
  const wind = Math.max(i.wind_kmh || 0, 0.5 * (i.gusts_kmh || 0));
  const temperature = 25 * clamp01((i.temperature_c - 10) / 30);
  const humidity = 35 * clamp01((80 - i.humidity_pct) / 70);
  const windPts = 25 * clamp01(wind / 40);
  const dryness = 15 * clamp01((i.dry_days ?? 0) / MAX_DRY_DAYS);
  const rain_factor = (i.precipitation_mm ?? 0) >= 0.2 ? 0.5 : 1;
  const risk_score = Math.round((temperature + humidity + windPts + dryness) * rain_factor);
  return {
    risk_score,
    fire_risk: riskCategory(risk_score),
    components: {
      temperature: round1(temperature),
      humidity: round1(humidity),
      wind: round1(windPts),
      dryness: round1(dryness),
      rain_factor,
    },
  };
}

/**
 * Días consecutivos sin lluvia contando hacia atrás desde el último día COMPLETO.
 * `dailyPrecip` va en orden cronológico; `includesToday` indica que el último elemento
 * es el día en curso (acumulado parcial + pronóstico), que se ignora.
 */
export function countDryDays(dailyPrecip: Array<number | null | undefined>, includesToday = true): number {
  const days = includesToday ? dailyPrecip.slice(0, -1) : dailyPrecip;
  let n = 0;
  for (let k = days.length - 1; k >= 0 && n < MAX_DRY_DAYS; k--) {
    const mm = days[k];
    if (typeof mm !== "number" || !Number.isFinite(mm) || mm >= DRY_DAY_THRESHOLD_MM) break;
    n += 1;
  }
  return n;
}
