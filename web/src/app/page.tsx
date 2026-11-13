import { Providers } from "@/components/Providers";
import { SiteNav } from "@/components/SiteNav";
import { Hero } from "@/components/Hero";
import { Intro } from "@/components/intro/Intro";
import { LiveDemo } from "@/components/demo/LiveDemo";
import { LiveMonitor } from "@/components/live/LiveMonitor";
import { HowItWorks } from "@/components/HowItWorks";
import { QuantumLayer } from "@/components/quantum/QuantumLayer";
import { Benchmark } from "@/components/Benchmark";
import { Limits } from "@/components/Limits";
import { Footer } from "@/components/Footer";

// Orden del relato: qué es (hero + resumen) → verlo funcionar con datos reales (monitor) →
// entender el recorrido (cómo funciona) → intentar romperlo (sandbox) → por qué post-cuántico →
// cuánto cuesta (rendimiento) → qué no garantiza (límites).
export default function Home() {
  return (
    <Providers>
      <SiteNav />
      <main id="contenido">
        <Hero />
        <Intro />
        <LiveMonitor />
        <HowItWorks />
        <LiveDemo />
        <QuantumLayer />
        <Benchmark />
        <Limits />
      </main>
      <Footer />
    </Providers>
  );
}
