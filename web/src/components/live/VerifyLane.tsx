"use client";
import { AnimatePresence, motion } from "motion/react";
import type { LiveSnapshot } from "@/lib/live/streamStore";
import { SIZES } from "@/lib/pipeline";
import { CheckIcon, CrossIcon } from "@/components/ui/icons";
import { shortHex } from "@/components/demo/meta";

const ease = [0.16, 1, 0.3, 1] as const;
const ms = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Emisor (servidor) → SSE → consumidor (navegador): quién firma y quién verifica. */
export function VerifyLane({ snap }: { snap: LiveSnapshot }) {
  const c = snap.collector;
  const chips = snap.log.filter((e) => e.kind === "batch").slice(0, 5).reverse();
  const seed =
    c?.seed_origin === "env"
      ? "semilla privada del servidor"
      : c?.seed_origin === "qrng-demo"
        ? "semilla de demo (QRNG simulado, pública)"
        : null;
  const mismatch = !!c && !!snap.hello && snap.hello.key_id !== c.key_id;

  return (
    <div className="border-b border-line p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[0.9375rem] font-semibold">Firmado en servidor · verificado en tu navegador</h3>
        <span className="font-mono text-xs text-smoke">
          ML-DSA-65 · firma {SIZES.signature.toLocaleString("es-AR")} B por lote
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)] md:items-stretch md:gap-4">
        <div className="rounded-md border border-line bg-ink px-3.5 py-3">
          <div className="readout text-azul">Servidor · recolector</div>
          <div className="mt-1.5 text-[0.8125rem] leading-snug text-ash">Consulta FIRMS, arma lotes y firma con la clave secreta.</div>
          <dl className="mt-2.5 font-mono text-[0.6875rem] leading-relaxed">
            <dt className="text-smoke">key_id</dt>
            <dd className="break-all text-azul" title={c?.key_id}>
              {c ? shortHex(c.key_id, 8) : "pidiendo /api/collector…"}
            </dd>
            {seed && <dd className="text-smoke">{seed}</dd>}
          </dl>
        </div>

        <div className="relative flex min-h-16 items-center overflow-hidden rounded-md border border-dashed border-line-strong px-2">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-line" />
          <span aria-hidden className="readout pointer-events-none absolute left-2 top-1.5 text-smoke">
            SSE /api/stream
          </span>
          <ul className="relative flex w-full items-center justify-end gap-1.5 pt-3" aria-label="Últimos lotes recibidos">
            <AnimatePresence mode="popLayout" initial={false}>
              {chips.map((e) => {
                if (e.kind !== "batch") return null;
                const good = e.status === "ok";
                return (
                  <motion.li
                    key={e.uid}
                    layout
                    initial={{ x: -64, opacity: 0, scale: 0.85 }}
                    animate={{ x: 0, opacity: 1, scale: 1 }}
                    exit={{ x: 40, opacity: 0 }}
                    transition={{ duration: 0.5, ease }}
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-sm border px-2 font-mono text-xs font-medium ${
                      good ? "border-ok/50 bg-ok/10 text-ok" : "border-bad/60 bg-bad/10 text-bad"
                    }`}
                  >
                    {good ? <CheckIcon width={12} height={12} className="shrink-0" /> : <CrossIcon width={12} height={12} className="shrink-0" />}
                    <span>
                      #{e.seq}
                      <span className="sr-only">{good ? " verificado" : " rechazado"}</span>
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
          {chips.length === 0 && (
            <span className="absolute inset-0 flex items-center justify-center pt-3 font-mono text-xs text-smoke">
              {snap.phase === "connecting" ? "abriendo flujo…" : "sin lotes todavía"}
            </span>
          )}
        </div>

        <div className="rounded-md border border-line bg-ink px-3.5 py-3">
          <div className="readout text-ok">Tu navegador · verificador</div>
          <div className="mt-1.5 text-[0.8125rem] leading-snug text-ash">
            Sólo tiene la clave pública: puede comprobar firmas, no fabricarlas.
            {snap.verifyMode === "worker" && " Verifica en un Web Worker, fuera del hilo de la página."}
          </div>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 font-mono text-[0.6875rem] leading-relaxed">
            <div>
              <dt className="text-smoke">último lote</dt>
              <dd className="text-sm text-bone">
                {snap.stats.lastVerifyMs > 0 ? `${ms(snap.stats.lastVerifyMs)} ms` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-smoke">media</dt>
              <dd className="text-sm text-bone">{snap.stats.avgVerifyMs > 0 ? `${ms(snap.stats.avgVerifyMs)} ms` : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {snap.keyChange && (
        <p role="alert" className="mt-3 rounded-sm border border-gold/50 bg-gold/10 px-3 py-2 text-[0.8125rem] leading-snug text-gold">
          <strong className="font-semibold">La clave del recolector cambió durante esta sesión</strong> (de{" "}
          <span className="font-mono">{shortHex(snap.keyChange.from, 6)}</span> a{" "}
          <span className="font-mono">{shortHex(snap.keyChange.to, 6)}</span>). Se adoptó la que publica /api/collector, que es
          el ancla de confianza. Si no esperabas una rotación de clave, no confíes en estos datos.
        </p>
      )}
      {mismatch && (
        <p className="mt-3 rounded-sm border border-bad/40 bg-bad/10 px-3 py-2 text-[0.8125rem] leading-snug text-bad">
          El flujo dice estar firmado con otra clave que la publicada en /api/collector. Los lotes se rechazan hasta que coincidan.
        </p>
      )}
    </div>
  );
}
