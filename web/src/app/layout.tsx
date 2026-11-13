import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "ARG Space Hackathon" }],
  keywords: [
    "NASA FIRMS",
    "incendios forestales",
    "Salta",
    "Cafayate",
    "criptografía post-cuántica",
    "ML-DSA-65",
    "FIPS 204",
    "SHA3-256",
    "integridad de datos",
    "Qiskit",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  // og:image y twitter:image salen de app/opengraph-image.tsx (twitter usa og:image si no hay imagen propia).
  openGraph: {
    title: "Cadena de custodia post-cuántica para focos de incendio en Salta",
    description:
      "Focos NASA FIRMS firmados lote por lote con ML-DSA-65. Inyectá ataques en la red y mirá cómo el verificador los detecta.",
    url: "/",
    siteName: SITE_NAME,
    locale: "es_AR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cadena de custodia post-cuántica para focos de incendio en Salta",
    description:
      "Focos NASA FIRMS firmados lote por lote con ML-DSA-65. Inyectá ataques en la red y mirá cómo el verificador los detecta.",
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#050b18",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${archivo.variable} ${plexMono.variable} antialiased`}>
      <body className="min-h-dvh">
        {/* Sin JavaScript las animaciones de entrada no corren: se anulan los estados iniciales ocultos. */}
        <noscript>
          <style>{`[style*="opacity:0"],[style*="clip-path"]{opacity:1!important;transform:none!important;clip-path:none!important;filter:none!important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
