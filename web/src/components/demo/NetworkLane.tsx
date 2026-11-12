"use client";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ATTACK_LABELS } from "@/lib/pipeline";
import type { AttackKind } from "@/lib/types";
import type { DemoSnapshot } from "@/lib/demo/engine";
import { ATTACK_ICON, ATTACK_ORDER } from "./meta";

const ease = [0.16, 1, 0.3, 1] as const;

function Node({ title, sub, tone }: { title: string; sub: string; tone: "cyan" | "ok" }) {
  return (
    <div className="w-[5.25rem] shrink-0 sm:w-28">
      <div className={`readout ${tone === "cyan" ? "text-cyan" : "text-ok"}`}>{title}</div>
      <div className="mt-1 font-mono text-[0.6875rem] leading-tight text-smoke">{sub}</div>
    </div>
  );
}

export function NetworkLane({ snap, onAttack }: { snap: DemoSnapshot; onAttack: (k: AttackKind) => void }) {
  const [hint, setHint] = useState<AttackKind | null>(null);
  const disabled = !snap.ready || snap.done;
  const inFlight = [...snap.queue].reverse();

  return (
    <div className="grid gap-x-12 gap-y-6 border-b border-line p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold">Red entre el recolector y el verificador</h3>
        <span className="font-mono text-xs text-smoke">{snap.queue.length} en tránsito</span>
      </div>

      <div className="mt-5 flex items-center gap-2 sm:gap-3">
        <Node title="Recolector" sub={`${snap.signed}/${snap.totalBatches} firmados`} tone="cyan" />
        <div className="relative flex h-14 min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden border-y border-dashed border-line-strong px-1.5">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-line" />
          <AnimatePresence mode="popLayout" initial={false}>
            {inFlight.map((q, i) => {
              const head = i === inFlight.length - 1;
              const attacked = !!q.mark;
              return (
                <motion.div
                  key={q.uid}
                  layout
                  initial={{ x: -56, opacity: 0, scale: 0.8 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: 56, opacity: 0, filter: "blur(4px)" }}
                  transition={{ duration: 0.45, ease }}
                  title={attacked ? `Ataque aplicado: ${ATTACK_LABELS[q.mark!].title}` : "Lote firmado en tránsito"}
                  className={`relative z-10 flex h-9 min-w-0 shrink items-center gap-1 rounded-sm border px-2 font-mono text-xs font-medium ${
                    attacked ? "border-bad bg-[#2a1216] text-bad" : "border-cyan/60 bg-[#0f2224] text-cyan"
                  } ${head ? "shadow-[0_6px_16px_-6px_rgb(0_0_0/0.9)]" : "opacity-80"}`}
                >
                  {attacked && <span className="shrink-0 [&>svg]:h-3 [&>svg]:w-3">{ATTACK_ICON[q.mark!]}</span>}
                  <span className="truncate">#{q.batch.payload.seq}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {snap.queue.length === 0 && (
            <span className="relative z-10 mx-auto bg-coal px-2 font-mono text-[0.6875rem] text-smoke">
              {snap.done ? "flujo terminado" : "sin lotes en tránsito"}
            </span>
          )}
        </div>
        <Node title="Verificador" sub={`${snap.metrics.received} recibidos`} tone="ok" />
      </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-bone">Inyectar un ataque sobre el próximo lote</span>
          <AnimatePresence>
            {snap.armed.map((k, i) => (
              <motion.span
                key={`${k}-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="rounded-sm border border-bad/50 px-1.5 py-0.5 font-mono text-[0.6875rem] text-bad"
              >
                en espera: {ATTACK_LABELS[k].title}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {ATTACK_ORDER.map((k) => (
            <motion.button
              key={k}
              type="button"
              disabled={disabled}
              onClick={() => {
                setHint(k);
                onAttack(k);
              }}
              onPointerEnter={() => setHint(k)}
              onFocus={() => setHint(k)}
              whileTap={disabled ? undefined : { scale: 0.95 }}
              className="group flex min-h-11 min-w-[6.25rem] flex-1 items-center justify-center gap-2 rounded-md border border-line-strong bg-char px-3 text-sm font-medium text-bone transition-colors duration-200 hover:border-bad hover:bg-[#2a1216] hover:text-bad disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line-strong disabled:hover:bg-char disabled:hover:text-bone"
            >
              <span className="text-bad">{ATTACK_ICON[k]}</span>
              {ATTACK_LABELS[k].title}
            </motion.button>
          ))}
        </div>
        <p className="mt-3 min-h-5 text-[0.8125rem] leading-snug text-ash" aria-live="polite">
          {hint
            ? ATTACK_LABELS[hint].desc
            : "Los lotes quedan un instante en tránsito. Cada botón actúa sobre el que está por entregarse."}
        </p>
      </div>
    </div>
  );
}
