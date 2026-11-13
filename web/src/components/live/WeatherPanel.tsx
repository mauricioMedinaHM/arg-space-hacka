"use client";
import { AnimatePresence, motion } from "motion/react";
import type { PollSnapshot } from "@/lib/live/pollStore";
import { RISK_ORDER, compass, riskTone, type RiskTone } from "@/lib/live/source";
import type { WeatherPoint, WeatherResponse } from "@/lib/live/types";
import { RelativeTime } from "./Ticking";

const ease = [0.16, 1, 0.3, 1] as const;

const RISK: Record<RiskTone, { text: string; bg: string; border: string; bar: string }> = {
  ok: { text: "text-ok", bg: "bg-ok/10", border: "border-ok/50", bar: "bg-ok" },
  azul: { text: "text-azul", bg: "bg-azul/10", border: "border-azul/50", bar: "bg-azul" },
  gold: { text: "text-gold", bg: "bg-gold/10", border: "border-gold/50", bar: "bg-gold" },
  fire: { text: "text-fire", bg: "bg-fire/10", border: "border-fire/60", bar: "bg-fire" },
  bad: { text: "text-bad", bg: "bg-bad/15", border: "border-bad/70", bar: "bg-bad" },
};

const n = (v: number, d = 0) =>
  Number.isFinite(v) ? v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

function WindArrow({ deg }: { deg: number }) {
  // La flecha apunta hacia donde va el viento (dirección meteorológica + 180°).
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="shrink-0 transition-transform duration-700 ease-expo motion-reduce:transition-none"
      style={{ transform: `rotate(${Number.isFinite(deg) ? (deg + 180) % 360 : 0}deg)` }}
    >
      <path d="M9 15.5V3M4.5 7.2 9 2.5l4.5 4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Card({ p, i }: { p: WeatherPoint; i: number }) {
  const tone = RISK[riskTone(p.fire_risk)];
  const level = Math.max(0, RISK_ORDER.indexOf(p.fire_risk));
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: i * 0.05, ease }}
      className="flex min-w-0 flex-col bg-coal p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 text-[0.875rem] font-semibold leading-tight text-bone">{p.name}</h4>
        <span
          className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold uppercase leading-none tracking-wider ${tone.text} ${tone.bg} ${tone.border}`}
        >
          <span className="sr-only">Riesgo de incendio: </span>
          {p.fire_risk}
        </span>
      </div>
      <div className="mt-3 font-mono text-[1.75rem] font-medium leading-none text-bone">
        {n(p.temperature_c, 1)}
        <span className="ml-0.5 text-sm text-smoke">°C</span>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-[0.75rem]">
        <dt className="text-smoke">Humedad</dt>
        <dd className="text-ash">{n(p.humidity_pct)} %</dd>
        <dt className="text-smoke">Viento</dt>
        <dd className="flex items-center gap-1.5 text-ash">
          <span className="text-azul">
            <WindArrow deg={p.wind_dir_deg} />
          </span>
          {n(p.wind_kmh)} km/h
          <span className="text-smoke">
            <span className="sr-only">desde el </span>
            {compass(p.wind_dir_deg)}
          </span>
        </dd>
        <dt className="text-smoke">Ráfagas</dt>
        <dd className="text-ash">{n(p.gusts_kmh)} km/h</dd>
        <dt className="text-smoke">Lluvia</dt>
        <dd className="text-ash">{n(p.precipitation_mm, 1)} mm</dd>
      </dl>
      <div className="mt-auto pt-3.5">
        <div className="flex gap-0.5" aria-hidden>
          {RISK_ORDER.map((r, k) => (
            <span key={r} className={`h-1 flex-1 rounded-full ${k <= level ? tone.bar : "bg-line"}`} />
          ))}
        </div>
        {Number.isFinite(p.risk_score) && (
          <div className="mt-1.5 font-mono text-[0.6875rem] text-smoke">índice {n(p.risk_score)}</div>
        )}
      </div>
    </motion.li>
  );
}

export function WeatherPanel({ weather }: { weather: PollSnapshot<WeatherResponse> }) {
  const { data, error, loading } = weather;
  const points = data?.points ?? [];
  const missing = (data?.missing_points ?? []).map((m) => (typeof m === "string" ? m : String((m as { name?: unknown })?.name ?? ""))).filter(Boolean);
  const fetched = data ? Date.parse(data.fetched_at) : NaN;
  const riskNote = (data as (WeatherResponse & { risk_note?: string }) | null)?.risk_note;

  return (
    <motion.section
      aria-labelledby="clima-titulo"
      className="flex flex-col overflow-hidden rounded-lg border border-line-strong bg-coal"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.7, ease }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-4 sm:px-5">
        <h3 id="clima-titulo" className="text-[1.0625rem] font-semibold">
          Tiempo y peligro de incendio
        </h3>
        <span className="font-mono text-xs text-smoke">
          {data ? (
            <>
              {data.source} · <RelativeTime ms={fetched} /> · se actualiza cada 10 min
            </>
          ) : loading ? (
            "consultando /api/weather…"
          ) : (
            "sin datos"
          )}
        </span>
      </div>

      {(data?.degraded || (error && data)) && (
        <p className="border-b border-line bg-gold/5 px-4 py-2.5 text-[0.8125rem] leading-snug text-gold sm:px-5">
          {data?.degraded
            ? (data.note ?? "El servicio meteorológico respondió en modo degradado.")
            : "No se pudo actualizar; se muestran los últimos valores recibidos."}
        </p>
      )}

      {missing.length > 0 && points.length > 0 && (
        <p className="border-b border-line px-4 py-2.5 text-[0.8125rem] leading-snug text-ash sm:px-5">
          Sin datos en esta consulta para: {missing.join(", ")}.
        </p>
      )}

      {points.length > 0 ? (
        <ul className="grid flex-1 grid-cols-2 gap-px bg-line lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {points.map((p, i) => (
              <Card key={p.name} p={p} i={i} />
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <div className="flex flex-1 items-center px-4 py-10 text-sm leading-relaxed text-ash sm:px-5">
          {loading
            ? "Consultando las condiciones actuales en seis localidades de Salta…"
            : "No hay datos meteorológicos disponibles ahora. Se reintenta automáticamente."}
        </div>
      )}

      <div className="border-t border-line px-4 py-3.5 sm:px-5">
        <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 font-mono text-[0.6875rem] uppercase tracking-wider text-ash" aria-label="Escala de riesgo">
          {RISK_ORDER.map((r) => (
            <li key={r} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${RISK[riskTone(r)].bar}`} />
              {r}
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[0.8125rem] leading-snug text-ash">
          <strong className="font-semibold text-bone">Índice indicativo, no oficial.</strong>{" "}
          {riskNote?.replace(/^\s*[ÍI]ndice indicativo,? no oficial[:.]?\s*/i, "") || "Combina temperatura, humedad relativa, viento y días sin lluvia."} No reemplaza los partes del Servicio
          Nacional de Manejo del Fuego ni del SMN.
        </p>
      </div>
    </motion.section>
  );
}
