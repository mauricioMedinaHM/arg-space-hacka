// Tipos de las rutas de tiempo real (CONTRACTS.md, sección "Tiempo real (v2)").
export interface CollectorInfo {
  alg: "ML-DSA-65";
  key_id: string;
  public_key_b64: string;
  stream_id: string;
  seed_origin: "env" | "qrng-demo" | string;
}

export interface StreamHello {
  key_id: string;
  public_key_b64: string;
  stream_id: string;
  stream_base?: string;
  /** Identificador del ciclo; el stream_id firmado es `<base>:<cycle_id>`. */
  cycle_id?: string;
  source: string;
  origin: string;
  fetched_at: string;
  total_detections: number;
  total_batches: number;
  /** Tamaño de lote efectivo (el servidor puede subirlo para respetar su tope de lotes). */
  batch_size?: number;
  degraded?: boolean;
  note?: string;
}

export interface StreamDone {
  batches: number;
  next_poll_s: number;
}

export type FireRisk = "bajo" | "moderado" | "alto" | "muy alto" | "extremo";

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
}

export interface WeatherResponse {
  fetched_at: string;
  source: string;
  points: WeatherPoint[];
  /** Localidades que el servicio no pudo resolver en esta consulta. */
  missing_points?: string[];
  degraded?: boolean;
  note?: string;
}

export interface SatPass {
  satellite: string;
  instrument: string;
  start_utc: string;
  max_utc: string;
  end_utc: string;
  max_elevation_deg: number;
  /** true si Salta queda dentro del barrido útil del instrumento en esa pasada. */
  in_swath?: boolean;
}

export interface PassesResponse {
  computed_at: string;
  tle_source: string;
  observer: { lat: number; lon: number; name: string };
  passes: SatPass[];
  degraded?: boolean;
  note?: string;
}
