// Datos del sitio para metadatos (Open Graph, robots, sitemap). Sin secretos: sólo URLs públicas.

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  // Vercel expone el dominio de producción del proyecto (sin protocolo) en build y runtime.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "https://web-xi-orcin-ajy10fzueh.vercel.app";
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "Custodia PQ · Salta";
export const SITE_TITLE = "Integridad post-cuántica para datos de incendios en Salta";
export const SITE_DESCRIPTION =
  "Cadena de custodia para focos de calor NASA FIRMS en Salta: cada lote se firma con ML-DSA-65 (FIPS 204) y un verificador detecta alteraciones, duplicados, pérdidas, reordenamientos y falsificaciones. Demo en vivo en el navegador.";
