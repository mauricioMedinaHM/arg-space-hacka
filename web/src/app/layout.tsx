import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

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
  title: "Integridad post-cuántica para datos de incendios en Salta",
  description:
    "Cadena de custodia para focos de calor NASA FIRMS en Salta: cada lote se firma con ML-DSA-65 (FIPS 204) y un verificador detecta alteraciones, duplicados, pérdidas, reordenamientos y falsificaciones. Demo en vivo en el navegador.",
  applicationName: "Custodia PQ · Salta",
  authors: [{ name: "ARG Space Hackathon" }],
  openGraph: {
    title: "Cadena de custodia post-cuántica para focos de incendio en Salta",
    description:
      "Focos NASA FIRMS firmados lote por lote con ML-DSA-65. Inyectá ataques en la red y mirá cómo el verificador los detecta.",
    locale: "es_AR",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0a09",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${archivo.variable} ${plexMono.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
