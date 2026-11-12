"use client";
import { motion } from "motion/react";
import { CheckIcon, CrossIcon } from "@/components/ui/icons";
import { SectionHeading, Shell } from "@/components/ui/Section";

const ease = [0.16, 1, 0.3, 1] as const;

const NOT = [
  {
    title: "No es QKD ni cifrado cuántico",
    text: "Es una firma digital post-cuántica (ML-DSA-65, NIST FIPS 204) que corre en software común. No hay canal cuántico y nada se cifra: los focos son datos públicos.",
  },
  {
    title: "No prueba que NASA haya firmado el dato",
    text: "La firma acredita integridad y procedencia desde el recolector en adelante. Si al recolector le llega un dato erróneo, lo firma igual. Y si le roban la clave, quien la tenga firma lotes que pasan por legítimos.",
  },
  {
    title: "No ve la pérdida del último lote",
    text: "Un lote suprimido se descubre cuando llega uno posterior. Si alguien corta el final del flujo, la secuencia no lo delata: hace falta conocer por un canal autenticado cuántos lotes se emitieron, o un latido firmado periódico.",
  },
  {
    title: "FIRMS puede no ver un incendio",
    text: "Nubes, humo denso o el dosel del bosque ocultan focos, y un fuego que empieza y termina entre dos pasadas del satélite no aparece. La publicación llega unas 3 horas después de la observación.",
  },
  {
    title: "Un foco de calor no es un perímetro",
    text: "Cada punto es el centro de un píxel de unos 375 m con una anomalía térmica. No dice cuánta superficie se quemó, y también puede ser un falso positivo.",
  },
  {
    title: "No despacha brigadas",
    text: "No es un sistema autónomo de respuesta. Es una capa de trazabilidad para el análisis y la coordinación, siempre junto a los equipos locales.",
  },
  {
    title: "Lo cuántico acá es simulado",
    text: "Los circuitos corren en Qiskit Aer, sin hardware de IBM. El QRNG simulado usa un generador clásico por debajo y su semilla es pública: sirve para la demo, nunca para una clave real.",
  },
  {
    title: "El escenario Cafayate es una reconstrucción",
    text: "Las detecciones de junio de 2026 son sintéticas, generadas a partir del parte oficial. No son observaciones satelitales.",
  },
];

export function Limits() {
  return (
    <Shell id="limites" className="bg-coal">
      <SectionHeading title="Lo que esta capa garantiza, y lo que no">
        <p>Una herramienta de integridad sirve si se sabe exactamente dónde termina. Estos son sus bordes.</p>
      </SectionHeading>

      <motion.div
        className="mb-14 flex max-w-4xl gap-4 border-y border-ok/40 py-6"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-8% 0px" }}
        transition={{ duration: 0.7, ease }}
      >
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok text-ink">
          <CheckIcon strokeWidth={2.2} />
        </span>
        <p className="text-xl font-medium leading-snug text-bone md:text-2xl">
          Sí garantiza que cada lote que acepta el verificador es exactamente el que firmó el recolector, en el orden en
          que lo firmó, y que si alguno se repite o falta en el medio del flujo, queda registrado.
        </p>
      </motion.div>

      <h3 className="sr-only">Lo que no garantiza</h3>
      <ul className="grid gap-x-14 md:grid-cols-2">
        {NOT.map((n, i) => (
          <motion.li
            key={n.title}
            className="flex gap-4 border-t border-line py-6"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-6% 0px" }}
            transition={{ duration: 0.55, delay: (i % 2) * 0.08, ease }}
          >
            <span className="mt-1 shrink-0 text-bad">
              <CrossIcon strokeWidth={2} />
            </span>
            <div>
              <h4 className="text-lg font-semibold text-bone">{n.title}</h4>
              <p className="mt-2 max-w-[52ch] text-[0.9375rem] leading-relaxed text-ash">{n.text}</p>
            </div>
          </motion.li>
        ))}
      </ul>
    </Shell>
  );
}
