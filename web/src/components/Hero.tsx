"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowDownIcon, CheckIcon, CrossIcon, ExternalIcon } from "@/components/ui/icons";

const ease = [0.16, 1, 0.3, 1] as const;

// PRNG determinista: mismas brasas en servidor y cliente (sin desajuste de hidratación).
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

const rnd = mulberry32(20260614);
const EMBERS = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  left: +(rnd() * 100).toFixed(2),
  size: +(1.5 + rnd() * 3.5).toFixed(2),
  rise: Math.round(320 + rnd() * 520),
  drift: Math.round((rnd() - 0.5) * 160),
  duration: +(6 + rnd() * 9).toFixed(2),
  delay: +(rnd() * 10).toFixed(2),
  hot: rnd() > 0.7,
}));

function Embers() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-[radial-gradient(ellipse_70%_100%_at_30%_100%,rgb(255_106_31/0.22),transparent_70%)]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-fire/50" />
      {EMBERS.map((e) => (
        <motion.span
          key={e.id}
          className={`absolute bottom-0 rounded-full ${e.hot ? "bg-amber" : "bg-fire"}`}
          style={{ left: `${e.left}%`, width: e.size, height: e.size }}
          initial={{ opacity: reduce ? 0.5 : 0, y: reduce ? -e.rise * 0.4 : 0 }}
          animate={
            reduce
              ? undefined
              : { y: [0, -e.rise], x: [0, e.drift * 0.4, e.drift], opacity: [0, 0.9, 0.7, 0], scale: [1, 1, 0.4] }
          }
          transition={{ duration: e.duration, delay: e.delay, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// Ilustración del encadenado (no son firmas reales; la demo de abajo sí firma).
const hx = (n: number, len = 10) => {
  const r = mulberry32(n * 7919 + 13);
  let s = "";
  while (s.length < len) s += Math.floor(r() * 16).toString(16);
  return s;
};

function ChainTicker() {
  const reduce = useReducedMotion();
  const [head, setHead] = useState(41);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setHead((h) => h + 1), 2600);
    return () => clearInterval(id);
  }, [reduce]);

  const rows = [0, 1, 2, 3].map((i) => head - i);
  return (
    <div aria-hidden className="relative w-full max-w-[27rem] select-none">
      <div className="mb-3 flex items-center justify-between font-mono text-[0.6875rem] text-smoke">
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
                className={`rounded-md border bg-coal/90 px-4 py-3 font-mono text-xs shadow-[0_18px_30px_-18px_rgb(0_0_0/0.9)] ${
                  bad ? "border-bad/70" : "border-line-strong"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-bone">lote #{seq}</span>
                  <span className={`inline-flex items-center gap-1.5 font-sans text-[0.75rem] font-semibold ${bad ? "text-bad" : "text-ok"}`}>
                    {bad ? <CrossIcon width={12} height={12} /> : <CheckIcon width={12} height={12} />}
                    {bad ? "Alterado: firma inválida" : "Firma válida"}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5 text-[0.6875rem] text-smoke">
                  <span>prev_hash</span>
                  <span className="truncate text-ash">{hx(seq - 1)}…</span>
                  <span>hash</span>
                  <span className={`truncate ${bad ? "text-bad" : "text-cyan"}`}>{hx(seq)}…</span>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      <p className="mt-3 font-sans text-[0.75rem] text-smoke">Ilustración del encadenado. La demo de abajo firma de verdad.</p>
    </div>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0, transition: { duration: 0.9, ease } } };

export function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden">
      <Embers />
      <div className="relative mx-auto grid w-full max-w-[1280px] items-center gap-12 px-4 pb-20 pt-14 sm:px-6 md:pb-28 md:pt-20 lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.75fr)] lg:px-10">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.h1 variants={item} className="display text-[clamp(2.1rem,5vw,4.25rem)]">
            Cadena de custodia <span className="whitespace-nowrap text-cyan">post-cuántica</span> para focos de incendio en{" "}
            <span className="text-fire">Salta</span>
          </motion.h1>
          <motion.p variants={item} className="prose-measure mt-7 text-[1.0625rem] leading-relaxed text-ash md:text-lg">
            El 14 de junio de 2026 el Gobierno de Salta informó un incendio forestal en Cafayate: más de 50 hectáreas
            de bosque nativo afectadas y guardia por riesgo de reinicio. Los focos que detecta NASA FIRMS pasan por
            varias manos antes de llegar a quien coordina. Acá cada lote viaja firmado con ML-DSA-65, y cualquier
            alteración, pérdida o falsificación en el camino queda a la vista.
          </motion.p>
          <motion.p variants={item} className="mt-4 text-sm text-smoke">
            Fuente:{" "}
            <a
              href="https://www.salta.gob.ar"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-ash underline decoration-line-strong underline-offset-4 transition-colors hover:text-bone"
            >
              Gobierno de Salta, 14/06/2026 <ExternalIcon width={12} height={12} />
            </a>
          </motion.p>
          <motion.div variants={item} className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#demo"
              className="inline-flex min-h-12 items-center gap-2.5 rounded-md bg-fire px-5 text-base font-semibold text-ink transition-[background-color,transform] duration-150 hover:bg-[#ff8442] active:scale-[0.97]"
            >
              Abrir la demo en vivo <ArrowDownIcon />
            </a>
            <a
              href="#limites"
              className="inline-flex min-h-12 items-center rounded-md border border-line-strong px-5 text-base font-medium text-bone transition-colors hover:bg-char"
            >
              Qué garantiza y qué no
            </a>
          </motion.div>
          <motion.dl
            variants={item}
            className="mt-12 grid max-w-xl grid-cols-2 gap-x-8 gap-y-4 border-t border-line pt-6 font-mono text-xs sm:grid-cols-4"
          >
            {[
              ["Sensor", "VIIRS 375 m"],
              ["Latencia FIRMS", "≈ 3 h"],
              ["Firma", "ML-DSA-65"],
              ["Hash", "SHA3-256"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-smoke">{k}</dt>
                <dd className="mt-1 text-[0.8125rem] text-bone">{v}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>
        <motion.div
          className="flex justify-start lg:justify-end"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.1, delay: 0.45, ease }}
        >
          <ChainTicker />
        </motion.div>
      </div>
    </section>
  );
}
