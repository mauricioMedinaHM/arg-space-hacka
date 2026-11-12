"use client";
import { AnimatePresence, motion } from "motion/react";
import type { LiveSnapshot } from "@/lib/live/streamStore";
import { formatSaltaClock } from "@/lib/live/time";
import { StatusBadge, shortHex } from "@/components/demo/meta";

const ease = [0.16, 1, 0.3, 1] as const;

const NOTE_STYLE = {
  info: "text-ash",
  warn: "bg-amber/5 text-amber",
  error: "bg-[#1d1113] text-[#ffb3ba]",
} as const;

/** Registro del flujo: un renglón por lote verificado, más reciente arriba. */
export function StreamLog({ snap }: { snap: LiveSnapshot }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <h3 className="text-[0.9375rem] font-semibold">Registro de verificación</h3>
        <span className="font-mono text-xs text-smoke">hora de Salta · más reciente arriba</span>
      </div>

      {/* Lectores de pantalla: se anuncia el resultado de cada ciclo, no cada lote (llegan cada 0,7 s). */}
      <p role="status" aria-live="polite" className="sr-only">
        {snap.announce}
      </p>

      <ol
        className="thin-scroll h-[20rem] overflow-y-auto overscroll-contain border-t border-line lg:h-auto lg:min-h-[16rem] lg:flex-1 lg:basis-0"
        aria-label="Lotes recibidos y resultado de su verificación"
        tabIndex={0}
      >
        {snap.log.length === 0 && (
          <li className="px-4 py-10 text-sm leading-relaxed text-ash sm:px-5">
            Esperando el primer lote firmado del servidor…
          </li>
        )}
        <AnimatePresence initial={false}>
          {snap.log.map((e) =>
            e.kind === "batch" ? (
              <motion.li
                key={e.uid}
                layout="position"
                initial={{ opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease }}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-b border-line px-4 py-2.5 sm:px-5"
              >
                <span className="pt-0.5 font-mono text-[0.6875rem] tabular-nums text-smoke">{formatSaltaClock(e.at)}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="font-mono text-sm font-medium tabular-nums text-bone">#{e.seq}</span>
                    <StatusBadge status={e.status} />
                    <span className="font-mono text-[0.6875rem] text-smoke">
                      {e.count} {e.count === 1 ? "foco" : "focos"} · {e.verifyMs.toFixed(1).replace(".", ",")} ms · {shortHex(e.hash, 5)}
                    </span>
                  </span>
                  {e.status !== "ok" && <span className="mt-1 block text-[0.8125rem] leading-snug text-ash">{e.detail}</span>}
                </span>
              </motion.li>
            ) : (
              <motion.li
                key={e.uid}
                layout="position"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease }}
                className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-b border-line px-4 py-2.5 text-[0.8125rem] leading-snug sm:px-5 ${NOTE_STYLE[e.kind]}`}
              >
                <span className="pt-0.5 font-mono text-[0.6875rem] tabular-nums text-smoke">{formatSaltaClock(e.at)}</span>
                <span>{e.text}</span>
              </motion.li>
            ),
          )}
        </AnimatePresence>
      </ol>
    </div>
  );
}
