"use client";
import type { Metrics } from "@/lib/demo/engine";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { TONE, type Tone } from "./meta";

export function MetricsBar({ m }: { m: Metrics }) {
  const cells: { label: string; value: number; tone?: Tone; decimals?: number; unit?: string }[] = [
    { label: "Lotes recibidos", value: m.received },
    { label: "Válidos", value: m.valid, tone: "ok" },
    { label: "Alterados", value: m.tampered, tone: "bad" },
    { label: "Duplicados", value: m.duplicate, tone: "violet" },
    { label: "Perdidos", value: m.lost, tone: "amber" },
    { label: "Reordenados", value: m.reordered, tone: "amber" },
    { label: "Falsificados", value: m.forged, tone: "bad" },
    { label: "Cadena rota", value: m.chain, tone: "bad" },
    { label: "Verificación media", value: m.avgVerifyMs, decimals: 2, unit: "ms", tone: "cyan" },
  ];
  return (
    <dl className="grid grid-cols-3 gap-px bg-line lg:grid-cols-9">
      {cells.map((c) => {
        const lit = c.value > 0 && c.tone;
        return (
          <div key={c.label} className="bg-coal px-4 py-4">
            <dt className="flex items-center gap-1.5 text-[0.75rem] text-ash">
              {c.tone && <span className={`h-1.5 w-1.5 rounded-full ${TONE[c.tone].dot} ${lit ? "" : "opacity-40"}`} />}
              {c.label}
            </dt>
            <dd
              className={`mt-1.5 font-mono text-[1.625rem] font-medium leading-none transition-colors duration-300 ${
                lit ? TONE[c.tone!].text : "text-bone"
              }`}
            >
              <AnimatedNumber value={c.value} decimals={c.decimals} />
              {c.unit && <span className="ml-1 text-sm text-smoke">{c.unit}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
