import { CountUp } from "./CountUp";
import { SourceLink } from "./SourceLink";
import type { SourceKey } from "./sources";

// Sólo cifras con fuente enlazada. Nada de estimaciones propias.
const NUMBERS: { pre?: string; value: number; unit: string; label: string; source: SourceKey }[] = [
  { pre: "+", value: 200, unit: "ha", label: "de bosque nativo afectadas en Cafayate, junio de 2026", source: "cafayate200" },
  { pre: "~", value: 50000, unit: "ha", label: "de yungas y monte afectadas en el norte salteño, 2022", source: "norte2022" },
  { value: 375, unit: "m", label: "mide cada píxel del sensor VIIRS que detecta los focos", source: "firms" },
  { pre: "≤ ", value: 3, unit: "h", label: "tarda FIRMS en publicar un foco tras la pasada del satélite", source: "firms" },
];

export function KeyNumbers() {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4 lg:gap-x-10">
      {NUMBERS.map((n) => (
        <div key={n.label} className="flex min-w-0 flex-col border-l-2 border-gold/60 pl-4">
          {/* dt después del dd visualmente: la cifra manda, la etiqueta la explica. */}
          <dt className="order-2 mt-2 text-[0.875rem] leading-snug text-ash">{n.label}</dt>
          <dd className="display order-1 text-[clamp(1.5rem,4.2vw,2.75rem)] whitespace-nowrap text-gold">
            {n.pre}
            <CountUp value={n.value} />
            <span className="ml-1.5 text-[0.55em] font-medium text-gold-soft">{n.unit}</span>
          </dd>
          <dd className="order-3 mt-2 text-[0.75rem] text-smoke">
            <SourceLink source={n.source} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
