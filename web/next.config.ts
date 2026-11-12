import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Orígenes externos que el NAVEGADOR necesita: sólo el mapa base (MapLibre).
// - OpenFreeMap: estilo, teselas vectoriales, glifos y sprites.
// - Esri (ArcGIS Online): teselas ráster de respaldo si OpenFreeMap no carga.
// FIRMS, Open-Meteo y CelesTrak se consultan desde el servidor (/api/*), no desde el cliente.
const MAP_ORIGINS = "https://tiles.openfreemap.org https://server.arcgisonline.com";

// CSP sin nonces: la página es estática (prerender), y un nonce exigiría render dinámico por pedido.
// - script-src 'unsafe-inline': Next inyecta scripts en línea (payload RSC / hidratación).
// - style-src 'unsafe-inline': motion y MapLibre escriben atributos style en línea.
// - worker-src blob:: MapLibre crea su worker desde /maplibre/*.mjs (y blob: en algunos navegadores).
// - 'unsafe-eval' sólo en desarrollo (React lo usa para depurar).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${MAP_ORIGINS}`,
  "font-src 'self' data:",
  `connect-src 'self' ${MAP_ORIGINS}${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // En Vercel todo es HTTPS; en `next start` local (http://localhost) se omite para no romper Safari.
  ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // El worker de MapLibre se copia desde node_modules en cada install: cambia sólo con la versión.
      {
        source: "/maplibre/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
