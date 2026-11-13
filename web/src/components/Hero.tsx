"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useReducedMotionSafe } from "@/components/ui/useReducedMotionSafe";
import { BocaStar, StarRow } from "@/components/ui/BocaStar";
import { ArrowDownIcon, CheckIcon, CrossIcon } from "@/components/ui/icons";

const ease = [0.16, 1, 0.3, 1] as const;

// PRNG determinista: mismas estrellas en servidor y cliente (sin desajuste de hidratación).
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(1905);
const STARS = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  left: +(rnd() * 100).toFixed(2),
  top: +(rnd() * 100).toFixed(2),
  size: Math.round(7 + rnd() * 15),
  base: +(0.1 + rnd() * 0.22).toFixed(2),
  duration: +(3 + rnd() * 5).toFixed(2),
  delay: +(rnd() * 6).toFixed(2),
  rotate: Math.round(rnd() * 72),
}));

/** Cielo de estrellas de cinco puntas sobre una franja azul. Decorativo. */
function StarField() {
  const reduce = useReducedMotionSafe();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_80%_at_75%_0%,var(--color-boca-deep),transparent_70%)]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gold/50" />
      {STARS.map((s) => (
        <motion.span
          key={s.id}
          className="absolute text-gold"
          style={{ left: `${s.left}%`, top: `${s.top}%`, rotate: s.rotate }}
          // Mismo estado inicial en servidor y cliente; la preferencia sólo cambia `animate`.
          initial={{ opacity: s.base }}
          animate={reduce ? { opacity: s.base } : { opacity: [s.base, s.base * 2.4, s.base], scale: [1, 1.18, 1] }}
          transition={reduce ? { duration: 0 } : { duration: s.duration, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
        >
          <BocaStar size={s.size} />
        </motion.span>
      ))}
    </div>
  );
}

// Ilustración del encadenado (no son firmas reales; el monitor y el sandbox sí firman).
const hx = (n: number, len = 10) => {
  const r = mulberry32(n * 7919 + 13);
  let s = "";
  while (s.length < len) s += Math.floor(r() * 16).toString(16);
  return s;
};

function ChainTicker() {
  const reduce = useReducedMotionSafe();
  const [head, setHead] = useState(41);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setHead((h) => h + 1), 2600);
    return () => clearInterval(id);
  }, [reduce]);

  const rows = [0, 1, 2, 3].map((i) => head - i);
  return (
    <div aria-hidden className="relative w-full max-w-[27rem] select-none">
      <div className="mb-3 flex items-center justify-between font-mono text-[0.6875rem] text-ash">
        <span>stream salta-firms-viirs</span>
        <span>ML-DSA-65 · SHA3-256</span>
      </div>
      <ol className="relative space-y-2">
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((seq, i) => {
            const bad = seq % 7 === 3;
            return (
              <motion.li
                key={seq}
                layout
                initial={{ opacity: 0, y: -28, filter: "blur(6px)" }}
                animate={{ opacity: 1 - i * 0.22, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.7, ease }}
                className={`rounded-md border bg-coal/90 px-4 py-3 font-mono text-xs shadow-[0_18px_30px_-18px_var(--color-ink)] ${
                  bad ? "border-bad/70" : "border-line-strong"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-bone">
                    <BocaStar size={11} filled={!bad} className={bad ? "text-bad" : "text-gold"} />
                    lote #{seq}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 font-sans text-[0.75rem] font-semibold ${bad ? "text-bad" : "text-ok"}`}>
                    {bad ? <CrossIcon width={12} height={12} /> : <CheckIcon width={12} height={12} />}
                    {bad ? "Alterado: firma inválida" : "Firma válida"}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5 text-[0.6875rem] text-smoke">
                  <span>prev_hash</span>
                  <span className="truncate text-ash">{hx(seq - 1)}…</span>
                  <span>hash</span>
                  <span className={`truncate ${bad ? "text-bad" : "text-azul-soft"}`}>{hx(seq)}…</span>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      <p className="mt-3 font-sans text-[0.75rem] text-ash">Ilustración del encadenado. El monitor y el sandbox firman de verdad.</p>
    </div>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
// Todo el pliegue inicial entra sólo con desplazamiento, nunca con opacity 0: el título es el LCP y,
// si el HTML del servidor lo trae invisible, espera a la hidratación (y sin JavaScript no se ve nunca).
const lead = { hidden: { y: 20 }, show: { y: 0, transition: { duration: 0.9, ease } } };

const ANSWERS = [
  ["Problema", "datos de incendio que no se pueden comprobar"],
  ["Solución", "cada lote firmado y encadenado"],
  ["Cómo", "ML-DSA-65, verificado en tu navegador"],
  ["Meta", "datos abiertos confiables, hoy y en la era cuántica"],
] as const;

export function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden">
      <StarField />
      <div className="relative mx-auto grid w-full max-w-[1280px] items-center gap-12 px-4 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-16 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.75fr)] lg:px-10">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.p variants={lead} className="readout mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-gold">
            <StarRow count={3} size={11} />
            Incendios forestales · Salta, NOA
          </motion.p>
          <motion.h1 variants={lead} className="display text-[clamp(2.1rem,5.4vw,4.4rem)]">
            Datos de incendios que nadie puede alterar <span className="text-gold">sin que se note</span>
          </motion.h1>
          <motion.p variants={lead} className="prose-measure mt-6 text-[1.0625rem] leading-relaxed text-ash md:text-xl md:leading-relaxed">
            Los focos que el satélite detecta sobre Salta pasan por muchas manos antes de llegar a quien coordina. Acá cada
            lote viaja con una <strong className="font-semibold text-bone">firma post-cuántica</strong> y tu navegador la
            comprueba antes de dibujar un solo punto en el mapa.
          </motion.p>
          <motion.div variants={lead} className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#monitor"
              className="inline-flex min-h-12 items-center gap-2.5 rounded-md bg-gold px-5 text-base font-semibold text-ink transition-[background-color,transform] duration-150 hover:bg-gold-soft active:scale-[0.97]"
            >
              <BocaStar size={16} />
              Ver en vivo
            </a>
            <a
              href="#demo"
              className="inline-flex min-h-12 items-center rounded-md border border-line-strong bg-ink/40 px-5 text-base font-medium text-bone transition-colors hover:border-gold hover:bg-char"
            >
              Probar ataques
            </a>
            <a
              href="#resumen"
              className="inline-flex min-h-12 items-center gap-2 px-2 text-[0.9375rem] font-medium text-azul-soft underline-offset-4 transition-colors hover:text-bone hover:underline"
            >
              Resumen en 10 segundos <ArrowDownIcon />
            </a>
          </motion.div>
          <motion.dl
            variants={lead}
            className="mt-10 grid max-w-3xl gap-x-6 gap-y-3 border-t border-line-strong pt-5 text-[0.875rem] sm:grid-cols-2"
          >
            {ANSWERS.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[1rem_1fr] gap-x-2">
                <BocaStar size={11} className="mt-[0.3rem] text-gold" />
                <div>
                  <dt className="inline font-semibold text-bone">{k}: </dt>
                  <dd className="inline text-ash">{v}</dd>
                </div>
              </div>
            ))}
          </motion.dl>
        </motion.div>
        <motion.div
          className="hidden justify-end lg:flex"
          initial={{ x: 30 }}
          animate={{ x: 0 }}
          transition={{ duration: 1.1, delay: 0.3, ease }}
        >
          <ChainTicker />
        </motion.div>
      </div>
    </section>
  );
}
