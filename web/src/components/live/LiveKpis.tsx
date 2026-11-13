"use client";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import type { LiveTotals } from "@/lib/live/source";
import type { LiveStats } from "@/lib/live/streamStore";
import { BocaStar } from "@/components/ui/BocaStar";
import { RelativeTime } from "./Ticking";

type Tone = "fire" | "gold" | "ok" | "bad" | "azul";
const TEXT: Record<Tone, string> = { fire: "text-fire", gold: "text-gold", ok: "text-ok", bad: "text-bad", azul: "text-azul" };

export function LiveKpis({
  totals,
  stats,
  live,
  latestLabel,
}: {
  totals: LiveTotals;
  stats: LiveStats;
  /** false cuando lo que se muestra es el snapshot de respaldo. */
  live: boolean;
  latestLabel?: string;
}) {
  const cells: { label: string; value: number; tone: Tone; decimals?: number; unit?: string; hint: string; alert?: boolean }[] = [
    {
      label: live ? "Focos últimas 24 h" : "Focos en el snapshot",
      value: totals.count,
      tone: "fire",
      hint: live ? "detecciones con firma verificada" : "no son de las últimas 24 h",
    },
    { label: "FRP total", value: totals.frp, tone: "gold", decimals: 1, unit: "MW", hint: "potencia radiativa sumada" },
    { label: "Alta confianza", value: totals.high, tone: "fire", hint: "focos con confianza «alta»" },
    { label: "Lotes verificados", value: stats.batchesOk, tone: "ok", hint: "firma y cadena correctas, en esta sesión" },
    {
      label: "Fallos de verificación",
      value: stats.batchesFailed,
      tone: "bad",
      hint: stats.batchesFailed ? "rechazos, huecos o duplicados: revisá el registro" : "sin rechazos, huecos ni duplicados",
      alert: true,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
      {cells.map((c) => {
        const lit = c.alert ? c.value > 0 : c.value > 0;
        return (
          <div key={c.label} className="bg-coal px-4 py-4">
            <dt className="flex items-center gap-1.5 text-[0.75rem] text-ash">
              <BocaStar size={9} className={`shrink-0 ${TEXT[c.tone]} ${lit ? "" : "opacity-45"}`} />
              {c.label}
            </dt>
            <dd
              className={`mt-1.5 font-mono text-[1.625rem] font-medium leading-none transition-colors duration-300 ${
                lit ? TEXT[c.tone] : "text-bone"
              }`}
            >
              <AnimatedNumber value={c.value} decimals={c.decimals} />
              {c.unit && <span className="ml-1 text-sm text-smoke">{c.unit}</span>}
            </dd>
            <dd className="mt-1.5 text-[0.6875rem] leading-snug text-smoke">{c.hint}</dd>
          </div>
        );
      })}
      <div className="bg-coal px-4 py-4">
        <dt className="flex items-center gap-1.5 text-[0.75rem] text-ash">
          <BocaStar size={9} className={`shrink-0 text-azul ${totals.latestMs ? "" : "opacity-45"}`} />
          Última detección
        </dt>
        <dd className="mt-1.5 font-mono text-[0.9375rem] font-medium leading-[1.625rem] text-bone">
          {totals.latestMs ? <RelativeTime ms={totals.latestMs} /> : "—"}
        </dd>
        <dd className="mt-1.5 text-[0.6875rem] leading-snug text-smoke">{latestLabel ?? "sin focos en este ciclo"}</dd>
      </div>
    </dl>
  );
}
