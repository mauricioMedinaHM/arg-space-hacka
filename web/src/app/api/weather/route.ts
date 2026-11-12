import { connection } from "next/server";
import { getWeather } from "@/lib/server/weather";

// GET /api/weather → { fetched_at, source:"open-meteo", points:[...], risk_note, degraded?, note? }
// Meteorología actual (Open-Meteo, sin clave) de 6 puntos de Salta + índice de peligro de
// incendio indicativo (lib/server/fire-risk.ts). Caché ~10 min (`use cache`). Nunca 500.

export const maxDuration = 30;

export async function GET() {
  // Sin esto el GET se prerenderizaría en el build (Cache Components) y un fallo de red
  // en ese momento dejaría la respuesta degradada "horneada".
  await connection();
  const body = await getWeather();
  return Response.json(body, {
    headers: {
      "Cache-Control":
        body.degraded || body.missing_points
          ? "public, s-maxage=60, stale-while-revalidate=60"
          : "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
