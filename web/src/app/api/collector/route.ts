import { connection } from "next/server";
import { getCollectorInfo } from "@/lib/server/collector-key";

// GET /api/collector → { alg:"ML-DSA-65", key_id, public_key_b64, stream_id, seed_origin, note? }
// Clave PÚBLICA del recolector del servidor (la que firma /api/stream). El navegador la usa
// como raíz de confianza del verificador. Nunca se expone la semilla ni la clave secreta.

export async function GET() {
  // Con Cache Components un GET sin datos de request se prerenderiza en el build:
  // connection() lo difiere al request para leer COLLECTOR_SEED_HEX del entorno de ejecución.
  await connection();
  try {
    return Response.json(getCollectorInfo(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      {
        alg: "ML-DSA-65",
        key_id: "",
        public_key_b64: "",
        stream_id: "",
        seed_origin: "qrng-demo",
        degraded: true,
        note: `Clave del recolector no disponible: ${e instanceof Error ? e.message : String(e)}`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
