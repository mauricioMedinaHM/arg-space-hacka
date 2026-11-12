import { Providers } from "@/components/Providers";
import { SiteNav } from "@/components/SiteNav";
import { Hero } from "@/components/Hero";
import { LiveDemo } from "@/components/demo/LiveDemo";
import { HowItWorks } from "@/components/HowItWorks";
import { QuantumLayer } from "@/components/quantum/QuantumLayer";
import { Benchmark } from "@/components/Benchmark";
import { Limits } from "@/components/Limits";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <Providers>
      <SiteNav />
      <main id="contenido">
        <Hero />
        <LiveDemo />
        <HowItWorks />
        <QuantumLayer />
        <Benchmark />
        <Limits />
      </main>
      <Footer />
    </Providers>
  );
}
