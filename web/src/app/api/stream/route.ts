import type { NextRequest } from "next/server";
import { STREAM_ID, getCollectorKey } from "@/lib/server/collector-key";
import { getLiveFirms } from "@/lib/server/firms-live";
import { SSE_HEADERS, clampBatchSize, createFirmsStream } from "@/lib/server/sse";

// GET /api/stream?batch=5|10|25|50 → text/event-stream (SSE)
// El servidor trae FIRMS en vivo (mismo fetch cacheado que /api/firms), arma lotes y los
// FIRMA con ML-DSA-65 (Collector del servidor). Eventos: hello, batch (~700 ms), done, error,
// y comentarios `: ping` cada 15 s. Se cierra tras `done`; el cliente reabre cada next_poll_s.
//
// Con Cache Components NO se pueden exportar `dynamic` ni `runtime` (error de build): la ruta
// es dinámica porque lee `request.nextUrl`/`request.signal` (nunca se prerenderiza ni se
// cachea) y el runtime es Node.js por defecto.
// Presupuesto: la sesión entera (fetch con sus fallbacks + emisión) se ajusta a 48 s
// (SESSION_BUDGET_MS): si el fetch tarda, los lotes salen más seguido. Siempre < maxDuration.
// stream_id firmado = `${STREAM_ID}:${cycle_id}` (ver lib/server/sse.ts).
export const maxDuration = 60;

function seedOrigin(): string | undefined {
  try {
    return getCollectorKey().seed_origin;
  } catch {
    return undefined; // el stream emitirá `event: error` al pedir la clave
  }
}

export async function GET(request: NextRequest) {
  const batchSize = clampBatchSize(request.nextUrl.searchParams.get("batch"));
  // Se lanza dentro del contexto del request (para `use cache`); getLiveFirms nunca rechaza.
  const feed = getLiveFirms(1);
  const stream = createFirmsStream({
    feed,
    getKeyPair: () => getCollectorKey().keyPair,
    streamId: STREAM_ID,
    seedOrigin: seedOrigin(),
    batchSize,
    signal: request.signal,
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
