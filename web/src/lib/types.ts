// CONTRATO COMPARTIDO — no cambiar sin actualizar todos los consumidores.

/** Una detección de foco activo estilo NASA FIRMS (VIIRS 375 m). */
export interface FireDetection {
  id: string;              // id estable, p.ej. `${satellite}-${acq_date}-${acq_time}-${lat}-${lon}`
  latitude: number;
  longitude: number;
  bright_ti4: number;      // K
  bright_ti5: number;      // K
  frp: number;             // Fire Radiative Power (MW)
  scan: number;
  track: number;
  acq_date: string;        // YYYY-MM-DD
  acq_time: string;        // HHMM UTC
  satellite: "N" | "N20" | "N21" | "Terra" | "Aqua";
  instrument: "VIIRS" | "MODIS";
  confidence: "l" | "n" | "h";
  daynight: "D" | "N";
  source: "historical" | "firms-live" | "synthetic";
}

/** Lote sin firmar que arma el recolector. */
export interface BatchPayload {
  stream_id: string;       // p.ej. "salta-firms-viirs"
  seq: number;             // 0,1,2,... monotónico
  prev_hash: string;       // hex SHA3-256 del lote firmado anterior ("00"*32 para seq 0)
  created_at: string;      // ISO
  key_id: string;          // hex primeros 16 bytes de SHA3-256(publicKey)
  detections: FireDetection[];
  /**
   * Opcional (aditivo): total de lotes de la sesión, declarado DENTRO del payload firmado.
   * Permite al verificador detectar que se suprimieron los últimos lotes (`Verifier.finalize()`),
   * cosa que la secuencia sola no delata. Si falta, el lote es idéntico al contrato anterior.
   */
  total_batches?: number;
}

/** Lote firmado con ML-DSA-65 (FIPS 204). */
export interface SignedBatch {
  payload: BatchPayload;
  payload_hash: string;    // hex SHA3-256(canonicalJSON(payload))
  signature: string;       // base64 de la firma ML-DSA-65
  alg: "ML-DSA-65";
}

export type IntegrityStatus =
  | "ok"
  | "tampered"      // firma inválida / hash no coincide
  | "duplicate"     // seq o hash ya visto
  | "gap"           // faltan lotes antes de éste (pérdida)
  | "reordered"     // llegó un seq menor al esperado y no visto antes
  | "unknown_key"   // key_id no confiable
  | "broken_chain"; // prev_hash no coincide con el lote anterior

export interface VerificationResult {
  seq: number;
  status: IntegrityStatus;
  detail: string;          // explicación en español
  verify_ms: number;
  missing_seqs?: number[]; // para "gap"
}

export type AttackKind = "tamper" | "duplicate" | "drop" | "reorder" | "forge";
