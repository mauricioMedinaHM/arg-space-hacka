"use client";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ALG, runBenchmarkAsync, type BenchResult } from "@/lib/pipeline";
import type { FireDetection } from "@/lib/types";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { SectionHeading, Shell } from "@/components/ui/Section";

const ease = [0.16, 1, 0.3, 1] as const;
const N = 50;
const PER_BATCH = 10;

type State =
  | { status: "idle" }
  | { status: "running"; done: number }
  | { status: "done"; r: BenchResult }
  | { status: "error" };

/** El snapshot (≈195 KB) se carga recién al medir: no pesa en la carga inicial de la página. */
async function loadSample(): Promise<FireDetection[]> {
  const mod = await import("@/data/firms-salta.json");
  return mod.default as unknown as FireDetection[];
}

export function Benchmark() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function run() {
    setState({ status: "running", done: 0 });
    try {
      // El benchmark cede el hilo entre lotes: la página sigue respondiendo mientras mide.
      const r = await runBenchmarkAsync(N, await loadSample(), PER_BATCH, (done) => {
        if (done % 5 === 0) setState({ status: "running", done });
      });
      setState({ status: "done", r });
    } catch {
      setState({ status: "error" });
    }
  }

  const r = state.status === "done" ? state.r : null;
  const timings = r
    ? [
        { label: "Generar el par de claves", ms: r.keygen_ms, note: "una sola vez" },
        { label: "Firmar un lote", ms: r.sign_ms_avg, note: "promedio" },
        { label: "Verificar un lote", ms: r.verify_ms_avg, note: "promedio" },
      ]
    : [];
  const maxMs = Math.max(...timings.map((t) => t.ms), 0.001);

  return (
    <Shell id="rendimiento">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
        <div>
          <SectionHeading title="¿Cuánto cuesta firmar todo?">
            <p>
              Medilo en tu dispositivo: {N} lotes de {PER_BATCH} focos, firmados y verificados con {ALG} en JavaScript
              puro, sin WebAssembly ni servidor.
            </p>
          </SectionHeading>
          <button
            type="button"
            onClick={run}
            disabled={state.status === "running"}
            className="inline-flex min-h-12 min-w-[14rem] items-center justify-center gap-2.5 rounded-md bg-cyan px-5 text-base font-semibold text-ink transition-[background-color,transform] duration-150 hover:bg-[#7be6ed] active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
          >
            {state.status === "running" ? (
              <>
                <motion.span
                  aria-hidden
                  className="h-2 w-2 rounded-full bg-ink"
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
                Midiendo…
              </>
            ) : state.status === "done" ? (
              "Volver a medir"
            ) : (
              "Correr el benchmark"
            )}
          </button>
          <p className="mt-4 max-w-[46ch] text-[0.8125rem] leading-relaxed text-smoke">
            Tarda alrededor de un segundo y corre en el hilo principal, en tandas cortas para no congelar la página.
            Los números dependen de tu equipo y navegador.
          </p>
          {state.status === "error" && (
            <p className="mt-4 text-sm text-bad" role="alert">
              El benchmark falló en este navegador. Probá recargar la página.
            </p>
          )}
        </div>

        <div className="min-h-[22rem]" role="status" aria-live="polite" aria-atomic="false">
          <AnimatePresence mode="wait">
            {!r ? (
              <motion.div
                key="empty"
                exit={{ opacity: 0 }}
                className="flex h-full min-h-[22rem] items-center justify-center rounded-lg border border-dashed border-line-strong p-8 text-center text-[0.9375rem] leading-relaxed text-ash"
              >
                {state.status === "running" ? (
                  <span>
                    Firmando y verificando {N} lotes…{" "}
                    <span aria-hidden className="font-mono tabular-nums text-smoke">
                      {state.done}/{N}
                    </span>
                  </span>
                ) : (
                  "Los resultados aparecen acá: tiempos por lote, caudal y cuánto pesa la firma."
                )}
              </motion.div>
            ) : (
              <motion.div key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <ul className="space-y-5">
                  {timings.map((t, i) => (
                    <li key={t.label}>
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-[0.9375rem] text-bone">
                          {t.label} <span className="text-smoke">({t.note})</span>
                        </span>
                        <span className="font-mono text-lg text-bone">
                          <AnimatedNumber value={t.ms} decimals={2} /> <span className="text-sm text-smoke">ms</span>
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-char">
                        <motion.div
                          className="h-full origin-left rounded-full bg-cyan"
                          style={{ width: `${Math.max((t.ms / maxMs) * 100, 1.5)}%` }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.9, delay: 0.1 + i * 0.12, ease }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>

                <motion.dl
                  className="mt-10 grid grid-cols-2 gap-x-8 border-t border-line"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.45, ease }}
                >
                  <div className="border-b border-line py-5">
                    <dt className="text-sm text-ash">Lotes por segundo (firma + verificación)</dt>
                    <dd className="mt-1 font-mono text-4xl font-medium text-cyan">
                      <AnimatedNumber value={r.batches_per_s} decimals={1} />
                    </dd>
                  </div>
                  <div className="border-b border-line py-5">
                    <dt className="text-sm text-ash">Detecciones por segundo</dt>
                    <dd className="mt-1 font-mono text-4xl font-medium text-cyan">
                      <AnimatedNumber value={r.detections_per_s} />
                    </dd>
                  </div>
                  <div className="border-b border-line py-4">
                    <dt className="text-sm text-ash">Clave pública</dt>
                    <dd className="mt-1 font-mono text-lg text-bone">{r.pk_bytes.toLocaleString("es-AR")} B</dd>
                  </div>
                  <div className="border-b border-line py-4">
                    <dt className="text-sm text-ash">Firma por lote</dt>
                    <dd className="mt-1 font-mono text-lg text-bone">{r.sig_bytes.toLocaleString("es-AR")} B</dd>
                  </div>
                  <div className="col-span-2 py-4">
                    <dt className="text-sm text-ash">Sobrecarga de la firma (base64) sobre el payload JSON</dt>
                    <dd className="mt-1 font-mono text-lg text-bone">
                      +<AnimatedNumber value={r.overhead_pct} decimals={1} /> %
                    </dd>
                  </div>
                </motion.dl>
                <p className="mt-2 max-w-[60ch] text-[0.8125rem] leading-relaxed text-ash">
                  FIRMS publica con unas 3 horas de latencia: unos milisegundos de firma por lote no cambian nada
                  operativo. El costo real es de tamaño, y baja al agrupar más focos por lote.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Shell>
  );
}
