"use client";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ATTACK_LABELS, SIZES, canonicalJSON } from "@/lib/pipeline";
import type { DemoSnapshot, LogEntry } from "@/lib/demo/engine";
import { ChevronIcon } from "@/components/ui/icons";
import { ATTACK_ICON, STATUS_META, StatusBadge, TONE, shortHex } from "./meta";

const ease = [0.16, 1, 0.3, 1] as const;

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3">
      <dt className="font-mono text-[0.6875rem] text-smoke">{k}</dt>
      <dd className="min-w-0 break-all font-mono text-[0.75rem] leading-relaxed text-bone">{children}</dd>
    </div>
  );
}

function BatchDetail({ entry }: { entry: Extract<LogEntry, { kind: "result" }> }) {
  const { batch } = entry;
  const canonical = canonicalJSON(batch.payload);
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.35, ease }}
      className="overflow-hidden"
    >
      <dl className="space-y-2.5 border-t border-line bg-ink px-4 py-4">
        <Field k="payload_hash">{batch.payload_hash}</Field>
        <Field k="prev_hash">{batch.payload.prev_hash}</Field>
        <Field k="key_id">{batch.payload.key_id}</Field>
        <Field k={`firma (${batch.alg})`}>
          {batch.signature.slice(0, 120)}…
          <span className="mt-1 block text-smoke">
            {batch.signature.length.toLocaleString("es-AR")} caracteres base64 · {SIZES.signature.toLocaleString("es-AR")} bytes
          </span>
        </Field>
        <div>
          <dt className="font-mono text-[0.6875rem] text-smoke">
            payload en JSON canónico ({canonical.length.toLocaleString("es-AR")} bytes, lo que se hashea y firma)
          </dt>
          <dd>
            <pre className="thin-scroll mt-1.5 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-line bg-coal p-3 font-mono text-[0.6875rem] leading-relaxed text-ash">
              {canonical}
            </pre>
          </dd>
        </div>
      </dl>
    </motion.div>
  );
}

export function BatchLog({ snap }: { snap: DemoSnapshot }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <h3 className="text-[0.9375rem] font-semibold">Registro del verificador</h3>
        <span className="font-mono text-xs text-smoke">más reciente arriba</span>
      </div>

      {snap.done && (
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mb-3 rounded-sm border border-line-strong bg-char px-3 py-2.5 text-[0.8125rem] leading-snug text-ash sm:mx-5"
        >
          Flujo terminado: {snap.signed} lotes firmados, {snap.metrics.received} recibidos.{" "}
          {snap.missing.length > 0 ? (
            <span className="text-gold">Nunca llegaron: #{snap.missing.join(", #")}.</span>
          ) : (
            <span className="text-ok">No quedó ningún hueco en la secuencia.</span>
          )}
        </motion.p>
      )}

      <ol className="thin-scroll h-[26rem] overflow-y-auto overscroll-contain border-t border-line lg:h-auto lg:min-h-[18rem] lg:flex-1 lg:basis-0" aria-live="off">
        {snap.log.length === 0 && (
          <li className="px-4 py-10 text-sm leading-relaxed text-ash sm:px-5">
            Todavía no llegó ningún lote. Tocá <strong className="font-semibold text-bone">Reproducir</strong> para
            arrancar el flujo, o avanzá de a un lote con <strong className="font-semibold text-bone">Paso</strong>.
          </li>
        )}
        <AnimatePresence initial={false}>
          {snap.log.map((e) => {
            if (e.kind === "event") {
              return (
                <motion.li
                  key={e.uid}
                  layout="position"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease }}
                  className="flex items-start gap-2.5 border-b border-line bg-bad/10 px-4 py-2.5 text-[0.8125rem] leading-snug text-ash sm:px-5"
                >
                  <span className="mt-0.5 shrink-0 text-bad">{ATTACK_ICON[e.attack]}</span>
                  <span>
                    <strong className="font-semibold text-bad">Ataque · {ATTACK_LABELS[e.attack].title}.</strong> {e.text}
                  </span>
                </motion.li>
              );
            }
            const { result, batch } = e;
            const tone = TONE[STATUS_META[result.status].tone];
            const isOpen = open === e.uid;
            return (
              <motion.li
                key={e.uid}
                layout="position"
                initial={{ opacity: 0, y: -18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease }}
                className="border-b border-line"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : e.uid)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors duration-150 hover:bg-char sm:px-5"
                >
                  <span className="flex items-center gap-2 pt-0.5">
                    <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                    <span className="w-9 font-mono text-sm font-medium tabular-nums text-bone">#{result.seq}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <StatusBadge status={result.status} />
                      <span className="font-mono text-[0.6875rem] text-smoke">
                        {batch.payload.detections.length} focos · {result.verify_ms.toFixed(2)} ms ·{" "}
                        {shortHex(batch.payload_hash, 5)}
                      </span>
                    </span>
                    <span className="mt-1.5 block text-[0.8125rem] leading-snug text-ash">{result.detail}</span>
                  </span>
                  <span className="flex items-center gap-1 pt-0.5 text-xs text-smoke">
                    <span className="hidden sm:inline">Ver lote</span>
                    <ChevronIcon className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                  </span>
                </button>
                <AnimatePresence initial={false}>{isOpen && <BatchDetail key="d" entry={e} />}</AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}
