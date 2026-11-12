"use client";
import { AnimatePresence, motion } from "motion/react";
import type { PollSnapshot } from "@/lib/live/pollStore";
import { formatSalta, passState, upcomingPasses } from "@/lib/live/time";
import type { PassesResponse, SatPass } from "@/lib/live/types";
import { useNow } from "@/lib/live/useNow";
import { Countdown, RelativeTime } from "./Ticking";

const ease = [0.16, 1, 0.3, 1] as const;
const HORIZON_MS = 24 * 3600 * 1000;

const SAT: Record<string, { dot: string; text: string }> = {
  "NOAA-20": { dot: "bg-cyan", text: "text-cyan" },
  "NOAA-21": { dot: "bg-violet", text: "text-violet" },
  "Suomi NPP": { dot: "bg-amber", text: "text-amber" },
  Aqua: { dot: "bg-ok", text: "text-ok" },
  Terra: { dot: "bg-fire", text: "text-fire" },
};
const satTone = (name: string) => SAT[name] ?? { dot: "bg-bone", text: "text-bone" };
const passKey = (p: SatPass) => `${p.satellite}-${p.start_utc}`;
const deg = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}°` : "—");

function Timeline({ passes, now }: { passes: SatPass[]; now: number }) {
  if (!now) return <div className="h-14" aria-hidden />;
  return (
    <div aria-hidden className="pt-1">
      <div className="relative h-10 border-b border-line-strong">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className="absolute bottom-0 h-2 w-px bg-line-strong" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        {passes.map((p) => {
          const start = Date.parse(p.start_utc);
          const x = Math.min(1, Math.max(0, (start - now) / HORIZON_MS));
          if (start - now > HORIZON_MS) return null;
          const h = 22 + (Math.min(90, Math.max(0, p.max_elevation_deg || 0)) / 90) * 78;
          return (
            <motion.span
              key={passKey(p)}
              layout
              className={`absolute bottom-0 w-[3px] origin-bottom rounded-t-sm ${satTone(p.satellite).dot}`}
              style={{ left: `calc(${x * 100}% - 1px)`, height: `${h}%` }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.6, ease }}
            />
          );
        })}
        <span className="absolute -bottom-px left-0 h-full w-px bg-bone" />
      </div>
      <div className="relative mt-1.5 h-4 font-mono text-[0.6875rem] text-smoke">
        <span className="absolute left-0 text-bone">ahora</span>
        {[6, 12, 18].map((h) => (
          <span key={h} className="absolute -translate-x-1/2" style={{ left: `${(h / 24) * 100}%` }}>
            +{h} h
          </span>
        ))}
        <span className="absolute right-0">+24 h</span>
      </div>
    </div>
  );
}

export function PassesPanel({ passes }: { passes: PollSnapshot<PassesResponse> }) {
  const now = useNow();
  const { data, error, loading } = passes;
  const list = data && now ? upcomingPasses(data.passes, now) : [];
  const next = list[0];
  const nextActive = next ? passState(next, now) === "active" : false;
  const computed = data ? Date.parse(data.computed_at) : NaN;
  const shown = list.slice(0, 7);

  return (
    <motion.section
      aria-labelledby="pasadas-titulo"
      className="flex flex-col overflow-hidden rounded-lg border border-line-strong bg-coal"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.7, delay: 0.08, ease }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-4 sm:px-5">
        <h3 id="pasadas-titulo" className="text-[1.0625rem] font-semibold">
          Próximas pasadas satelitales
        </h3>
        <span className="font-mono text-xs text-smoke">
          {data ? (
            <>
              sobre {data.observer?.name ?? "Salta"} · calculadas <RelativeTime ms={computed} />
            </>
          ) : loading ? (
            "consultando /api/passes…"
          ) : (
            "sin datos"
          )}
        </span>
      </div>

      {(data?.degraded || (error && data)) && (
        <p className="border-b border-line bg-amber/5 px-4 py-2.5 text-[0.8125rem] leading-snug text-amber sm:px-5">
          {data?.degraded
            ? (data.note ?? "Se usaron elementos orbitales de respaldo: los horarios pueden correrse algunos minutos.")
            : "No se pudo actualizar; se muestran las últimas pasadas calculadas."}
        </p>
      )}

      {next ? (
        <>
          <div className="grid gap-x-6 gap-y-4 border-b border-line px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-5">
            <div className="min-w-0">
              <div className="readout text-smoke">{nextActive ? "Pasando ahora" : "Próxima pasada"}</div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={`text-xl font-semibold ${satTone(next.satellite).text}`}>{next.satellite}</span>
                <span className="font-mono text-xs text-ash">
                  {next.instrument} · elevación máx. {deg(next.max_elevation_deg)}
                  {next.in_swath !== undefined && (
                    <span className={next.in_swath ? "text-ok" : "text-smoke"}>
                      {" "}
                      · {next.in_swath ? "con cobertura útil" : "al borde del barrido"}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 font-mono text-xs text-ash">
                {formatSalta(Date.parse(next.start_utc), false)}–{formatSalta(Date.parse(next.end_utc), false)} hora de Salta
              </div>
            </div>
            <div className="sm:text-right">
              <div className="readout text-smoke">{nextActive ? "termina en" : "empieza en"}</div>
              <Countdown
                to={Date.parse(nextActive ? next.end_utc : next.start_utc)}
                className="font-mono text-[2rem] font-medium leading-none text-bone"
              />
            </div>
          </div>

          <div className="border-b border-line px-4 pb-3 pt-4 sm:px-5">
            <Timeline passes={list} now={now} />
          </div>

          <ol className="flex-1">
            <AnimatePresence initial={false}>
              {shown.map((p) => {
                const active = passState(p, now) === "active";
                const tone = satTone(p.satellite);
                const elev = Math.min(90, Math.max(0, p.max_elevation_deg || 0));
                return (
                  <motion.li
                    key={passKey(p)}
                    layout="position"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.4, ease }}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_4.5rem_auto] sm:px-5"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-bone">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                      <span className="truncate">{p.satellite}</span>
                      <span className="hidden font-mono text-[0.6875rem] font-normal text-smoke min-[420px]:inline">{p.instrument}</span>
                      {p.in_swath === false && (
                        <span className="shrink-0 rounded-sm border border-line-strong px-1 font-mono text-[0.6875rem] font-normal text-smoke" title="Salta queda fuera del barrido útil del instrumento en esta pasada">
                          sin cobertura<span className="sr-only"> útil</span>
                        </span>
                      )}
                    </span>
                    <span className="order-3 flex items-center gap-2 font-mono text-[0.6875rem] text-ash sm:order-none">
                      <span className="h-1 w-16 overflow-hidden rounded-full bg-line sm:w-full sm:max-w-28" aria-hidden>
                        <span className={`block h-full ${tone.dot}`} style={{ width: `${(elev / 90) * 100}%` }} />
                      </span>
                      <span className="shrink-0">
                        <span className="sr-only">elevación máxima </span>
                        {deg(p.max_elevation_deg)}
                      </span>
                    </span>
                    <span className="order-4 text-right font-mono text-xs tabular-nums text-ash sm:order-none sm:text-left">
                      {formatSalta(Date.parse(p.start_utc), false)}
                    </span>
                    <span className="order-2 text-right font-mono text-sm sm:order-none sm:min-w-[5.5rem]">
                      {active ? (
                        <span className="text-ok">pasando</span>
                      ) : (
                        <Countdown to={Date.parse(p.start_utc)} className="text-bone" />
                      )}
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </>
      ) : (
        <div className="flex flex-1 items-center px-4 py-10 text-sm leading-relaxed text-ash sm:px-5">
          {!data && loading
            ? "Calculando las próximas pasadas sobre Salta…"
            : data
              ? "No quedan pasadas calculadas en la ventana de 24 h. Se recalcula automáticamente."
              : "No hay pasadas disponibles ahora. Se reintenta automáticamente."}
        </div>
      )}

      <p className="border-t border-line px-4 py-3.5 text-[0.8125rem] leading-snug text-ash sm:px-5">
        Pasadas geométricas calculadas con elementos orbitales ({data?.tle_source ?? "TLE"}) y SGP4. Cuanto mayor la elevación,
        más centrada queda Salta en el barrido; las marcadas «sin cobertura» pasan demasiado bajas para observarla bien. Los focos de cada pasada aparecen en FIRMS unas 3 h después.
      </p>
    </motion.section>
  );
}
