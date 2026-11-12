"use client";
import { motion } from "motion/react";
import { useReducedMotionSafe } from "@/components/ui/useReducedMotionSafe";
import type { IntegrityStatus } from "@/lib/types";
import { SectionHeading, Shell } from "@/components/ui/Section";
import { StatusBadge } from "@/components/demo/meta";

const ease = [0.16, 1, 0.3, 1] as const;

const STAGES = [
  {
    name: "NASA FIRMS",
    color: "var(--color-fire)",
    text: "Detecciones de focos activos VIIRS (375 m), publicadas con unas 3 horas de latencia.",
  },
  {
    name: "Recolector",
    color: "var(--color-cyan)",
    text: "Agrupa focos en lotes, los encadena con prev_hash, calcula SHA3-256 y firma con ML-DSA-65.",
  },
  {
    name: "Red",
    color: "var(--color-bad)",
    text: "Canal no confiable. Acá un lote puede alterarse, perderse, repetirse, desordenarse o ser suplantado.",
  },
  {
    name: "Verificador",
    color: "var(--color-ok)",
    text: "Comprueba clave, hash, firma, secuencia y cadena. Lo que no pasa queda marcado, no se descarta en silencio.",
  },
  {
    name: "Mapa y coordinación",
    color: "var(--color-bone)",
    text: "Sólo lo verificado alimenta el análisis, junto a brigadas y equipos locales que conocen el terreno.",
  },
];

// Tres paquetes recorren el riel. El segundo es alterado en la red y el verificador lo frena.
const PACKETS = [
  { delay: 0, tampered: false },
  { delay: 2, tampered: true },
  { delay: 4, tampered: false },
];
const FIRE = "#ff6a1f";
const CYAN = "#45d9e3";
const BAD = "#ff5263";
const OK = "#4bd58f";

function Rail({ vertical }: { vertical?: boolean }) {
  const reduce = useReducedMotionSafe();
  if (reduce) return null;
  return (
    <>
      {PACKETS.map((p, i) => {
        const travel = p.tampered ? ["0%", "25%", "50%", "75%", "75%"] : ["0%", "25%", "50%", "75%", "100%"];
        return (
          <motion.span
            key={i}
            aria-hidden
            className={`pointer-events-none absolute ${vertical ? "left-0 top-0 h-full w-px" : "left-0 top-0 h-px w-full"}`}
            initial={vertical ? { y: "0%" } : { x: "0%" }}
            animate={vertical ? { y: travel } : { x: travel }}
            transition={{ duration: 6, delay: p.delay, repeat: Infinity, ease: "linear", times: [0, 0.25, 0.5, 0.75, 1] }}
          >
            <motion.span
              className="absolute -left-[5px] -top-[5px] block h-[11px] w-[11px] rounded-[2px]"
              initial={{ backgroundColor: FIRE, opacity: 0 }}
              animate={{
                backgroundColor: p.tampered ? [FIRE, CYAN, BAD, BAD, BAD] : [FIRE, CYAN, CYAN, OK, OK],
                opacity: p.tampered ? [0, 1, 1, 1, 0] : [0, 1, 1, 1, 0],
                scale: p.tampered ? [1, 1, 1.25, 1.6, 0.2] : [1, 1, 1, 1, 1],
                rotate: p.tampered ? [0, 0, 45, 45, 45] : 0,
              }}
              transition={{ duration: 6, delay: p.delay, repeat: Infinity, ease: "linear", times: [0, 0.2, 0.5, 0.75, 1] }}
            />
          </motion.span>
        );
      })}
    </>
  );
}

const CHECKS: { name: string; what: string; fail: IntegrityStatus; note?: string }[] = [
  {
    name: "Lista de claves",
    what: "El lote tiene que estar bien formado, declarar ML-DSA-65 y traer un key_id que figure entre las claves públicas en las que confía el verificador.",
    fail: "unknown_key",
  },
  {
    name: "Hash SHA3-256",
    what: "Se recalcula el hash sobre el JSON canónico del payload y se compara con el declarado.",
    fail: "tampered",
  },
  {
    name: "Firma ML-DSA-65",
    what: "Se verifica la firma sobre ese hash con la clave pública del recolector (FIPS 204).",
    fail: "tampered",
  },
  {
    name: "Repetición",
    what: "Un lote cuyo hash ya fue aceptado se descarta: es un reenvío o un replay.",
    fail: "duplicate",
  },
  {
    name: "Secuencia (seq)",
    what: "Un salto hacia adelante delata lotes faltantes; un seq atrasado que llega después queda como reordenado.",
    fail: "gap",
    note: "La pérdida se nota recién cuando llega un lote posterior; la del último lote, sólo si se conoce el total esperado.",
  },
  {
    name: "Cadena (prev_hash)",
    what: "Cada lote incluye el hash del anterior ya firmado. Si no coincide con sus vecinos, o si dos lotes distintos reclaman el mismo número, el flujo se bifurcó.",
    fail: "broken_chain",
  },
];

export function HowItWorks() {
  return (
    <Shell id="como-funciona" className="bg-coal">
      <SectionHeading title="Del satélite al mapa, con cada eslabón a la vista">
        <p>
          La firma no hace que el dato sea verdadero. Hace que no pueda cambiar sin que se note entre quien lo
          recolecta y quien lo usa.
        </p>
      </SectionHeading>

      {/* Escritorio: riel horizontal */}
      <div className="hidden lg:block">
        <div className="relative mx-[10%] h-px bg-line-strong [overflow-clip-margin:10px] [overflow-x:clip]">
          <Rail />
        </div>
        <ol className="grid grid-cols-5">
          {STAGES.map((s, i) => (
            <motion.li
              key={s.name}
              className="relative px-4 pt-8 text-center"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.7, delay: i * 0.1, ease }}
            >
              <span
                aria-hidden
                className="absolute left-1/2 top-0 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-coal"
                style={{ borderColor: s.color }}
              />
              <h3 className="text-lg font-semibold" style={{ color: s.color }}>
                {s.name}
              </h3>
              <p className="mx-auto mt-2 max-w-[24ch] text-sm leading-relaxed text-ash">{s.text}</p>
            </motion.li>
          ))}
        </ol>
      </div>

      {/* Móvil: riel vertical */}
      <div className="relative pl-7 lg:hidden">
        <div className="absolute bottom-3 left-[6px] top-2 w-px bg-line-strong [overflow-clip-margin:10px] [overflow-y:clip]">
          <Rail vertical />
        </div>
        <ol className="space-y-7">
          {STAGES.map((s, i) => (
            <motion.li
              key={s.name}
              className="relative"
              initial={{ opacity: 0, x: 14 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-8% 0px" }}
              transition={{ duration: 0.6, delay: i * 0.05, ease }}
            >
              <span
                aria-hidden
                className="absolute -left-7 top-1.5 h-[13px] w-[13px] rounded-full border-2 bg-coal"
                style={{ borderColor: s.color }}
              />
              <h3 className="text-lg font-semibold" style={{ color: s.color }}>
                {s.name}
              </h3>
              <p className="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-ash">{s.text}</p>
            </motion.li>
          ))}
        </ol>
      </div>

      <div className="mt-20 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] lg:gap-16">
        <div>
          <h3 className="display text-xl md:text-[1.375rem]">Seis comprobaciones, siempre en este orden</h3>
          <p className="mt-4 max-w-[42ch] text-[0.9375rem] leading-relaxed text-ash">
            El verificador corta en la primera que falla. Así el resultado dice exactamente qué se rompió, y no sólo que
            algo anda mal.
          </p>
        </div>
        <ol className="border-t border-line">
          {CHECKS.map((c, i) => (
            <motion.li
              key={c.name}
              className="grid gap-x-6 gap-y-2 border-b border-line py-5 sm:grid-cols-[2rem_11rem_minmax(0,1fr)] md:grid-cols-[2rem_12rem_minmax(0,1fr)_auto] md:items-baseline"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-6% 0px" }}
              transition={{ duration: 0.55, delay: i * 0.06, ease }}
            >
              <span className="font-mono text-sm text-smoke">{i + 1}</span>
              <h4 className="text-base font-semibold text-bone">{c.name}</h4>
              <p className="max-w-[58ch] text-[0.9375rem] leading-relaxed text-ash">
                {c.what}
                {c.note && <span className="text-smoke"> {c.note}</span>}
              </p>
              <span className="flex items-center gap-2 text-xs text-smoke sm:col-start-3 md:col-start-auto md:justify-end">
                si falla <StatusBadge status={c.fail} />
              </span>
            </motion.li>
          ))}
        </ol>
      </div>
    </Shell>
  );
}
