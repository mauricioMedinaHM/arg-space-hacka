"use client";
import { motion } from "motion/react";
import type { LiveSnapshot } from "@/lib/live/streamStore";
import { describeSource } from "@/lib/live/source";
import { BocaStar } from "@/components/ui/BocaStar";
import { ResetIcon } from "@/components/ui/icons";
import { Countdown, RelativeTime, useProgress } from "./Ticking";

type Tone = "live" | "snap" | "azul" | "bad" | "smoke";

const TONES: Record<Tone, { text: string; bg: string; border: string }> = {
  live: { text: "text-gold", bg: "bg-gold/10", border: "border-gold/60" },
  snap: { text: "text-azul-soft", bg: "bg-boca/30", border: "border-boca" },
  azul: { text: "text-azul", bg: "bg-azul/10", border: "border-azul/50" },
  bad: { text: "text-bad", bg: "bg-bad/10", border: "border-bad/60" },
  smoke: { text: "text-ash", bg: "bg-char", border: "border-line-strong" },
};

export function indicatorOf(snap: LiveSnapshot): { label: string; tone: Tone; pulse: boolean } {
  if (snap.phase === "paused") return { label: "En pausa", tone: "smoke", pulse: false };
  if (snap.phase === "retrying") return { label: "Sin conexión", tone: "bad", pulse: false };
  if (!snap.hello) return { label: "Conectando", tone: "azul", pulse: true };
  return describeSource(snap.hello.source, snap.hello.origin).live
    ? { label: "En vivo", tone: "live", pulse: true }
    : { label: "Snapshot · no es en vivo", tone: "snap", pulse: false };
}

function Indicator({ label, tone, pulse }: { label: string; tone: Tone; pulse: boolean }) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex min-h-8 shrink-0 items-center gap-2.5 rounded-sm border px-3 font-mono text-[0.75rem] font-semibold uppercase tracking-[0.14em] ${t.text} ${t.bg} ${t.border}`}
    >
      {/* Estrella de estado: llena y latiendo en vivo; hueca cuando lo que se ve es el snapshot. */}
      <span className="relative flex h-3 w-3 items-center justify-center">
        {pulse && (
          <motion.span
            aria-hidden
            className="absolute inset-0 motion-reduce:hidden"
            animate={{ scale: [1, 2.6], opacity: [0.7, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          >
            <BocaStar size={12} className="block" />
          </motion.span>
        )}
        <BocaStar size={12} filled={tone !== "snap"} className="relative block" />
      </span>
      {label}
    </span>
  );
}

export function StatusHeader({ snap, onRefresh }: { snap: LiveSnapshot; onRefresh: () => void }) {
  const ind = indicatorOf(snap);
  const src = snap.hello ? describeSource(snap.hello.source, snap.hello.origin) : null;
  const fetchedMs = snap.hello ? Date.parse(snap.hello.fetched_at) : NaN;
  const waiting = snap.phase === "waiting" || snap.phase === "retrying";
  const progress = useProgress(waiting ? snap.nextPollAt : null, snap.waitMs);
  const busy = snap.phase === "connecting" || snap.phase === "streaming";

  return (
    <div className="border-b border-line p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Indicator {...ind} />
          <div className="min-w-0">
            <div className={`text-[0.9375rem] font-medium leading-snug ${src && !src.live ? "text-gold" : "text-bone"}`}>
              {src ? src.label : snap.phase === "retrying" ? "Todavía no hay datos del servidor" : "Pidiendo la clave pública y abriendo el flujo…"}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ash">
              {snap.hello && (
                <span>
                  Datos consultados <RelativeTime ms={fetchedMs} className="text-bone" />
                </span>
              )}
              {snap.hello && (
                <span>
                  <span className="text-smoke">source</span> {snap.hello.source} <span className="text-smoke">· origin</span>{" "}
                  {snap.hello.origin}
                </span>
              )}
              {snap.hello?.cycle_id && (
                <span className="break-all">
                  <span className="text-smoke">ciclo</span> {snap.hello.cycle_id}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 lg:w-56 lg:flex-none">
            <div className="flex items-baseline justify-between gap-3 font-mono text-xs text-ash">
              <span>
                {busy
                  ? snap.phase === "streaming"
                    ? `Recibiendo lote ${Math.min(snap.cycleReceived + 1, Math.max(snap.cycleTotal, 1))}/${snap.cycleTotal}`
                    : "Conectando…"
                  : snap.phase === "retrying"
                    ? `Reintento ${snap.attempt} en`
                    : snap.phase === "paused"
                      ? "Pestaña en segundo plano"
                      : "Próxima consulta en"}
              </span>
              {waiting && <Countdown to={snap.nextPollAt} className="text-sm font-medium text-bone" />}
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
              <div
                className={`h-full origin-left transition-transform duration-1000 ease-linear motion-reduce:transition-none ${
                  snap.phase === "retrying" ? "bg-bad" : "bg-gold"
                }`}
                style={{
                  transform: `scaleX(${busy ? (snap.cycleTotal ? snap.cycleReceived / snap.cycleTotal : 0.08) : progress})`,
                }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy || snap.phase === "paused"}
            aria-label="Consultar ahora"
            title="Consultar ahora"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line-strong text-bone transition-colors duration-150 hover:bg-char active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ResetIcon className={busy ? "animate-spin motion-reduce:animate-none" : ""} />
          </button>
        </div>
      </div>

      {snap.phase === "retrying" && snap.error && (
        <p className="mt-3 rounded-sm border border-bad/40 bg-bad/10 px-3 py-2 text-[0.8125rem] leading-snug text-bad">
          {snap.error} Se reintenta solo, con espera creciente.
          {snap.detections.length > 0 && " El mapa conserva el último ciclo verificado."}
        </p>
      )}
      {snap.hello?.note && src && !src.live && (
        <p className="mt-3 text-[0.8125rem] leading-snug text-gold">{snap.hello.note}</p>
      )}

      <p className="mt-3 max-w-[92ch] text-[0.8125rem] leading-snug text-ash">
        <strong className="font-semibold text-bone">«En vivo» no es instantáneo.</strong> FIRMS publica cada pasada unas 3 horas
        después de la observación, y un satélite ve Salta pocas veces al día: el mapa muestra lo último publicado, no el fuego de
        este minuto.
      </p>
    </div>
  );
}
