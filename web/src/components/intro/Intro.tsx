"use client";
import { motion } from "motion/react";
import type { ReactNode, SVGProps } from "react";
import { BocaStar, StarRow } from "@/components/ui/BocaStar";
import { useReducedMotionSafe } from "@/components/ui/useReducedMotionSafe";
import { KeyNumbers } from "./KeyNumbers";
import { SourceLink } from "./SourceLink";

const ease = [0.16, 1, 0.3, 1] as const;

const ico = (p: SVGProps<SVGSVGElement>) => ({
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});
const FlameIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}>
    <path d="M12.3 3c.7 4 5.2 6 5.2 10.8a5.5 5.5 0 0 1-11 0c0-2.2 1-3.7 2.2-4.9.3 1.7 1.1 2.6 2.1 2.9-.5-3.3.3-6.5 1.5-8.8Z" />
  </svg>
);
const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6Z" />
    <path d="m8.8 12 2.3 2.3 4.2-4.6" />
  </svg>
);
const FlowIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}>
    <circle cx="5" cy="6" r="2" />
    <circle cx="19" cy="12" r="2" />
    <circle cx="5" cy="18" r="2" />
    <path d="M7 6h5a3 3 0 0 1 3 3v0a3 3 0 0 0 2 3M7 18h5a3 3 0 0 0 3-3v0a3 3 0 0 1 2-3" />
  </svg>
);
const TargetIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
);

const THREATS = ["Alteración", "Pérdida", "Duplicado", "Reordenamiento", "Falsificación"];

const STEPS: ReactNode[] = [
  <>
    <b className="font-semibold text-bone">NASA FIRMS</b> publica los focos que detecta el sensor VIIRS.
  </>,
  <>
    El <b className="font-semibold text-bone">recolector</b> los agrupa en lotes, los encadena y los firma con ML-DSA-65
    sobre SHA3-256.
  </>,
  <>
    <b className="font-semibold text-bone">Tu navegador</b> verifica cada firma con la clave pública.
  </>,
  <>
    Sólo lo verificado llega al <b className="font-semibold text-bone">mapa</b> y a quien coordina.
  </>,
];

const GOALS = [
  "Trazabilidad verificable para brigadas, Defensa Civil y analistas.",
  "Datos abiertos que se consumen de forma segura.",
  "Infraestructura pública lista para la era post-cuántica.",
];

function Card({
  n,
  title,
  lead,
  icon,
  children,
}: {
  n: string;
  title: string;
  lead: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.li
      variants={{ hidden: { opacity: 0, y: 26 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } } }}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-line-strong bg-coal p-5 sm:p-6"
    >
      {/* Estrella de fondo: motivo, no contenido. */}
      <BocaStar
        size={120}
        className="pointer-events-none absolute -right-7 -top-7 text-boca opacity-40 transition-transform duration-500 ease-expo group-hover:rotate-[18deg]"
      />
      <div className="relative flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-boca text-gold-soft">{icon}</span>
        <span className="readout flex items-center gap-1.5 text-gold">
          <BocaStar size={10} />
          {n} / 04
        </span>
      </div>
      <h3 className="relative mt-5 text-[0.9375rem] font-semibold text-azul-soft">{title}</h3>
      <p className="relative mt-1.5 text-[1.25rem] font-semibold leading-tight tracking-tight text-bone [text-wrap:balance]">{lead}</p>
      <div className="relative mt-4 flex flex-1 flex-col gap-3 text-[0.9375rem] leading-relaxed text-ash">{children}</div>
    </motion.li>
  );
}

export function Intro() {
  const reduce = useReducedMotionSafe();
  return (
    <section id="resumen" aria-labelledby="resumen-titulo" className="border-t border-line bg-ink">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 md:py-20 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <h2 id="resumen-titulo" className="display max-w-[20ch] text-[clamp(1.6rem,3.6vw,2.6rem)]">
            El proyecto en cuatro respuestas
          </h2>
          <p className="readout flex items-center gap-2 text-smoke">
            <StarRow count={3} size={10} />
            Lectura de 10 segundos
          </p>
        </div>

        <motion.ol
          className="mt-8 grid list-none gap-4 md:grid-cols-2 xl:grid-cols-4"
          variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.1 } } }}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        >
          <Card n="01" title="El problema" lead="El fuego se combate con datos que nadie puede comprobar." icon={<FlameIcon />}>
            <p>
              En junio de 2026 un incendio en Cafayate afectó primero más de 50 ha de bosque nativo y, al reactivarse con el
              viento, más de 200 ha. En 2022 fueron unas 50.000 ha en el norte salteño.
            </p>
            <p>
              Los focos que ve el satélite pasan por muchos sistemas antes de llegar a quien coordina. Si algo cambia en el
              camino, hoy no queda rastro.
            </p>
            <p className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[0.75rem] text-smoke">
              <SourceLink source="cafayate50" />
              <SourceLink source="cafayate200" />
              <SourceLink source="norte2022" />
            </p>
          </Card>

          <Card n="02" title="Qué solucionamos" lead="Cualquier cambio en el camino queda a la vista." icon={<ShieldIcon />}>
            <p>Cada lote de focos viaja firmado y encadenado al anterior. El verificador marca:</p>
            <ul className="flex flex-wrap gap-1.5">
              {THREATS.map((t) => (
                <li key={t} className="rounded border border-line-strong bg-char px-2 py-1 text-[0.8125rem] text-bone">
                  {t}
                </li>
              ))}
            </ul>
            <p>
              Y es <b className="font-semibold text-gold">post-cuántico</b>: la firma ML-DSA-65 está diseñada para resistir a
              las computadoras cuánticas que romperían RSA y ECDSA.
            </p>
            <p className="mt-auto pt-1 text-[0.75rem] text-smoke">
              <SourceLink source="fips204" />
            </p>
          </Card>

          <Card n="03" title="Cómo lo hacemos" lead="Firmamos en origen y verificás en tu navegador." icon={<FlowIcon />}>
            <ol className="space-y-2.5">
              {STEPS.map((s, i) => (
                <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-x-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold font-mono text-[0.6875rem] font-semibold text-ink">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-auto pt-1 text-[0.8125rem]">
              Simulaciones en Qiskit (Shor y Grover){" "}
              <a href="#cuantica" className="text-azul-soft underline underline-offset-4 hover:text-bone">
                explican la amenaza cuántica
              </a>
              .
            </p>
          </Card>

          <Card n="04" title="A qué apuntamos" lead="Datos abiertos de incendios en los que se pueda confiar." icon={<TargetIcon />}>
            <ul className="space-y-2.5">
              {GOALS.map((g) => (
                <li key={g} className="grid grid-cols-[1.25rem_1fr] gap-x-2">
                  <BocaStar size={14} className="mt-1 text-gold" />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-1 text-[0.8125rem]">
              <a href="#como-funciona" className="text-azul-soft underline underline-offset-4 hover:text-bone">
                Ver el recorrido completo
              </a>
            </p>
          </Card>
        </motion.ol>

        <p className="mt-4 flex gap-3 rounded-lg border border-line bg-coal px-5 py-4 text-[0.9375rem] leading-relaxed text-ash">
          <BocaStar filled={false} size={16} className="mt-1 shrink-0 text-gold" />
          <span>
            <b className="font-semibold text-bone">Lo que no es:</b> no es un sistema de despacho, no es QKD ni usa hardware
            cuántico, y no prueba que NASA firmó el dato original. La firma protege desde nuestro recolector en adelante.{" "}
            <a href="#limites" className="whitespace-nowrap text-azul-soft underline underline-offset-4 hover:text-bone">
              Ver límites
            </a>
          </span>
        </p>

        <div className="mt-12 md:mt-16">
          <h3 className="readout mb-6 text-smoke">Cifras con fuente</h3>
          <KeyNumbers />
        </div>
      </div>
    </section>
  );
}
