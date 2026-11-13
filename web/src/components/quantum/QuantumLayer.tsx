"use client";
import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  useQuantum,
  type GroverData,
  type Loadable,
  type QrngData,
  type ShorData,
  type SummaryData,
} from "@/lib/quantum";
import { BocaStar, StarSpinner } from "@/components/ui/BocaStar";
import { SectionHeading, Shell } from "@/components/ui/Section";

const ease = [0.16, 1, 0.3, 1] as const;
const nf = (n: number, d = 0) => n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

type TabId = "qrng" | "shor" | "grover";
const TABS: { id: TabId; label: string; sub: string }[] = [
  { id: "qrng", label: "QRNG", sub: "La semilla de la clave" },
  { id: "shor", label: "Shor, N = 15", sub: "Por qué caen RSA y ECDSA" },
  { id: "grover", label: "Grover", sub: "Por qué SHA3-256 aguanta" },
];

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="border-t border-line py-3">
      <dt className="text-[0.75rem] text-ash">{k}</dt>
      <dd className="mt-1 font-mono text-lg text-bone">{v}</dd>
    </div>
  );
}

function Circuit({ text, label }: { text: string; label: string }) {
  return (
    <figure className="mt-10">
      <figcaption className="mb-2 text-[0.8125rem] text-ash">{label}</figcaption>
      <pre
        tabIndex={0}
        role="group"
        aria-label={`${label}. Diagrama de texto; se puede desplazar con las flechas.`}
        className="circuit thin-scroll max-h-80 overflow-auto rounded-md border border-line bg-ink p-4 text-ash"
      >
        {text}
      </pre>
    </figure>
  );
}

function Pending<T>({ state, file, children }: { state: Loadable<T>; file: string; children: (d: T) => ReactNode }) {
  if (state.status === "loading") {
    return (
      <div className="space-y-4" role="status" aria-busy="true" aria-label="Cargando resultados">
        <div className="flex h-48 items-center justify-center rounded-md border border-boca bg-boca/15">
          <StarSpinner size={28} />
        </div>
        <div className="h-4 w-2/3 rounded bg-char" />
        <div className="h-4 w-1/2 rounded bg-char" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p className="rounded-md border border-gold/40 bg-gold/5 p-5 text-[0.9375rem] leading-relaxed text-ash">
        <strong className="font-semibold text-gold">No se pudo cargar /quantum/{file}.</strong> Los resultados se
        generan con <code className="font-mono text-bone">python quantum/run_all.py</code>. El resto de la página
        funciona igual; la demo usa una clave aleatoria local.
      </p>
    );
  }
  return <>{children(state.data)}</>;
}

function Split({ chart, children }: { chart: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
      <div className="min-w-0">{chart}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Takeaway({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h3 className="display text-2xl md:text-[1.75rem]">{title}</h3>
      <div className="mt-4 space-y-3 text-[0.9375rem] leading-relaxed text-ash [&_strong]:font-semibold [&_strong]:text-bone">
        {children}
      </div>
    </>
  );
}

/* ---------- QRNG ---------- */
function QrngPanel({ d }: { d: QrngData }) {
  const keys = Object.keys(d.counts).sort();
  const max = Math.max(...keys.map((k) => d.counts[k]), 1);
  const expected = d.shots / 2 ** d.n_qubits;
  const W = 512;
  const H = 150;
  const bw = W / keys.length;
  const y = (v: number) => H - (v / max) * (H - 6);
  return (
    <>
      <Split
        chart={
          <figure>
            <figcaption className="mb-3 text-[0.8125rem] text-ash">
              Frecuencia de cada uno de los {keys.length} valores posibles de {d.n_qubits} qubits en {nf(d.shots)} disparos.
              La línea marca lo esperado si fueran uniformes ({nf(expected, 0)} por valor).
            </figcaption>
            <motion.div
              initial={{ clipPath: "inset(0 100% 0 0)" }}
              whileInView={{ clipPath: "inset(0 0% 0 0)" }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease }}
            >
              <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Histograma de valores del QRNG simulado, aproximadamente uniforme">
                {keys.map((k, i) => (
                  <rect key={k} x={i * bw + 0.25} y={y(d.counts[k])} width={bw - 0.5} height={H - y(d.counts[k])} fill="var(--color-azul-soft)" opacity={0.85} />
                ))}
                <line x1={0} x2={W} y1={y(expected)} y2={y(expected)} stroke="var(--color-bone)" strokeWidth={1} strokeDasharray="4 3" />
              </svg>
            </motion.div>
            <div className="mt-1.5 flex justify-between font-mono text-[0.6875rem] text-smoke">
              <span>{keys[0]}</span>
              <span>{keys[keys.length - 1]}</span>
            </div>
          </figure>
        }
      >
        <Takeaway title="Ocho Hadamard, 32 disparos, 32 bytes de semilla">
          <p>
            Cada qubit en superposición colapsa a 0 o 1 con probabilidad pareja. Cada disparo entrega {d.n_qubits} bits;
            los primeros 256 bits medidos, sin post-procesar, forman la semilla.
          </p>
          <p>
            <strong>Esta semilla genera la clave ML-DSA-65 del recolector de la demo.</strong> Es didáctico: un
            simulador produce números pseudoaleatorios, y una semilla publicada nunca debe usarse para una clave real.
          </p>
        </Takeaway>
        <div className="mt-6">
          <div className="text-[0.75rem] text-ash">seed_hex</div>
          <div className="mt-1.5 break-all rounded-md border border-azul-soft/40 bg-azul-soft/5 p-3 font-mono text-[0.8125rem] leading-relaxed text-azul-soft">
            {d.seed_hex}
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          <Stat k="Entropía de Shannon por bit" v={nf(d.entropy_bits_per_bit, 6)} />
          <Stat k={`χ²${d.chi_square_dof ? ` (${d.chi_square_dof} g.l.)` : ""}`} v={nf(d.chi_square, 2)} />
          <Stat k="Valor p" v={nf(d.p_value, 3)} />
        </dl>
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-smoke">
          Estas pruebas sólo dicen que no se detecta sesgo en la muestra; no certifican aleatoriedad.
        </p>
      </Split>
      <Circuit text={d.circuit_text} label="Circuito del QRNG (salida de Qiskit)" />
    </>
  );
}

/* ---------- Barras genéricas ---------- */
function Bars({
  items,
  max,
  label,
}: {
  items: { key: string; value: number; top: string; bottom: ReactNode; strong?: boolean; tick?: number }[];
  max: number;
  label: string;
}) {
  return (
    <div role="img" aria-label={label} className="flex h-64 items-stretch gap-3 sm:gap-5">
      {items.map((it, i) => (
        <div key={it.key} className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex flex-1 items-end border-b border-line-strong">
            <motion.div
              className={`relative w-full origin-bottom rounded-t-sm ${it.strong ? "bg-gold" : "bg-azul/45"}`}
              style={{ height: `${(it.value / max) * 100}%` }}
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: i * 0.08, ease }}
            >
              <span className={`absolute inset-x-0 -top-6 text-center font-mono text-xs ${it.strong ? "text-bone" : "text-ash"}`}>
                {it.top}
              </span>
            </motion.div>
            {it.tick !== undefined && (
              <span
                aria-hidden
                className="absolute inset-x-0 h-0 border-t border-dashed border-bone/80"
                style={{ bottom: `${(it.tick / max) * 100}%` }}
              />
            )}
          </div>
          <div className="pt-2 text-center font-mono text-[0.6875rem] leading-tight text-ash">{it.bottom}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Shor ---------- */
function ShorPanel({ d }: { d: ShorData }) {
  const shots = d.shots ?? Object.values(d.counts).reduce((a, b) => a + b, 0);
  const phases = [...d.measured_phases].sort((a, b) => a.phase - b.phase);
  const half = d.a ** (d.period / 2);
  const max = Math.max(...phases.map((p) => d.counts[p.bitstring] ?? p.count ?? 0), 1) * 1.15;
  return (
    <>
      <Split
        chart={
          <figure>
            <figcaption className="mb-8 text-[0.8125rem] text-ash">
              Resultados del registro de fase en {nf(shots)} disparos. Cada pico es una fracción s/r; las resaltadas
              revelan el período r = {d.period}.
            </figcaption>
            <Bars
              label={`Shor: cuatro fases medidas con frecuencia similar; el período es ${d.period}`}
              max={max}
              items={phases.map((p) => ({
                key: p.bitstring,
                value: d.counts[p.bitstring] ?? p.count ?? 0,
                top: nf(d.counts[p.bitstring] ?? p.count ?? 0),
                strong: p.valid_period ?? p.r_guess === d.period,
                bottom: (
                  <>
                    <span className="block text-bone">fase {p.fraction}</span>
                    <span className="block text-smoke">r = {p.r_guess}</span>
                  </>
                ),
              }))}
            />
          </figure>
        }
      >
        <Takeaway title={`${d.N} = ${d.factors[0]} × ${d.factors[1]}, encontrado por un circuito`}>
          <p>
            El algoritmo de Shor busca el período de {d.a}
            <sup>x</sup> mod {d.N}. Con el período en mano, factorizar es aritmética de secundaria.
          </p>
          <p>
            <strong>
              Una computadora cuántica grande y tolerante a fallos haría lo mismo con RSA y ECDSA. Por eso los lotes se
              firman con ML-DSA
            </strong>
            , cuya seguridad se apoya en problemas de retículos para los que no se conoce un atajo cuántico.
          </p>
          <p className="text-smoke">
            N = 15 es un ejemplo de juguete: romper RSA-2048 exige millones de qubits físicos con corrección de errores,
            que hoy no existen.
          </p>
        </Takeaway>
        <ol className="mt-6 space-y-0 font-mono text-[0.8125rem] text-bone">
          {[
            ["fases medidas", phases.map((p) => p.fraction).join(" · ")],
            ["período", `r = ${d.period}`],
            [`${d.a}^(r/2)`, `${half}`],
            [`mcd(${half} − 1, ${d.N})`, `${d.factors[0]}`],
            [`mcd(${half} + 1, ${d.N})`, `${d.factors[1]}`],
          ].map(([k, v], i) => (
            <motion.li
              key={k}
              className="flex justify-between gap-4 border-t border-line py-2.5"
              initial={{ opacity: 0, x: 12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease }}
            >
              <span className="text-ash">{k}</span>
              <span className={i > 2 ? "text-azul-soft" : ""}>{v}</span>
            </motion.li>
          ))}
        </ol>
      </Split>
      <Circuit text={d.circuit_text} label="Circuito de búsqueda de orden (salida de Qiskit). Desplazá horizontalmente." />
    </>
  );
}

/* ---------- Grover ---------- */
function GroverPanel({ d }: { d: GroverData }) {
  const space = d.search_space ?? 2 ** d.n_qubits;
  return (
    <>
      <Split
        chart={
          <figure>
            <figcaption className="mb-8 text-[0.8125rem] text-ash">
              Probabilidad de medir el estado buscado ({d.target}) según la cantidad de iteraciones. La marca punteada es
              el valor teórico. Pasarse del óptimo empeora el resultado.
            </figcaption>
            <Bars
              label={`Grover: la probabilidad de éxito sube hasta ${nf(Math.max(...d.iterations.map((i) => i.p_success)) * 100, 1)} % en ${d.optimal_k} iteraciones y luego baja`}
              max={1.08}
              items={d.iterations.map((it) => ({
                key: String(it.k),
                value: it.p_success,
                top: `${nf(it.p_success * 100, 1)} %`,
                strong: it.k === d.optimal_k,
                tick: it.p_theory,
                bottom: (
                  <>
                    <span className="block text-bone">k = {it.k}</span>
                    {it.k === d.optimal_k && <span className="block text-azul-soft">óptimo</span>}
                  </>
                ),
              }))}
            />
          </figure>
        }
      >
        <Takeaway title="Una aceleración cuadrática, no un derrumbe">
          <p>
            Grover encuentra una entrada entre {space} con unas {nf(d.quantum_queries, 1)} consultas, contra unas{" "}
            {nf(d.classical_expected_queries, 0)} en promedio por fuerza bruta. La ventaja crece como la raíz cuadrada del
            espacio de búsqueda, nada más.
          </p>
          <p>
            <strong>
              Contra SHA3-256, eso deja la búsqueda de preimágenes en torno a 2¹²⁸ operaciones cuánticas: sigue fuera de
              alcance.
            </strong>{" "}
            El hash y la firma ML-DSA de cada lote se mantienen.
          </p>
        </Takeaway>
        <dl className="mt-6 grid grid-cols-2 gap-x-6">
          <Stat k="Consultas clásicas (≈ N/2)" v={nf(d.classical_expected_queries, 0)} />
          <Stat k="Consultas cuánticas (≈ π/4·√N)" v={nf(d.quantum_queries, 2)} />
        </dl>
      </Split>
      <Circuit text={d.circuit_text} label={`Circuito de Grover con ${d.optimal_k} iteraciones (salida de Qiskit)`} />
    </>
  );
}

export function QuantumLayer() {
  const [tab, setTab] = useState<TabId>("qrng");
  const uid = useId();
  const tablist = useRef<HTMLDivElement>(null);

  // Patrón ARIA de pestañas: un solo tope de tabulación y flechas / Inicio / Fin para cambiar.
  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    const cur = TABS.findIndex((t) => t.id === tab);
    let next: number;
    if (e.key === "ArrowRight") next = (cur + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (cur - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next].id);
    tablist.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  const qrng = useQuantum<QrngData>("qrng");
  const shor = useQuantum<ShorData>("shor");
  const grover = useQuantum<GroverData>("grover");
  const summary = useQuantum<SummaryData>("summary");

  return (
    <Shell id="cuantica" className="band-boca">
      <SectionHeading title="Tres circuitos Qiskit que explican por qué firmamos así">
        <p>
          La capa cuántica no protege los datos: justifica las decisiones criptográficas. Un generador simulado da la
          semilla, Shor muestra qué se rompe y Grover muestra qué resiste.
        </p>
      </SectionHeading>

      <div
        ref={tablist}
        role="tablist"
        aria-label="Experimentos cuánticos"
        onKeyDown={onTabKey}
        className="grid grid-cols-3 border-b border-line"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={active}
              aria-controls={`${uid}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`relative px-2 pb-4 pt-2 text-left transition-colors duration-200 sm:px-4 ${
                active ? "text-bone" : "text-ash hover:text-bone"
              }`}
            >
              <span className="flex items-center gap-2 text-base font-semibold sm:text-xl">
                <BocaStar
                  size={14}
                  filled={active}
                  className={`shrink-0 transition-[color,transform] duration-300 ${active ? "rotate-0 text-gold" : "-rotate-[36deg] text-smoke"}`}
                />
                {t.label}
              </span>
              <span className="mt-1 hidden pl-[22px] text-[0.8125rem] text-ash sm:block">{t.sub}</span>
              {active && (
                <motion.span
                  layoutId={`${uid}-underline`}
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-gold"
                  transition={{ type: "spring", stiffness: 480, damping: 40 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} tabIndex={0} className="pt-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
            transition={{ duration: 0.35, ease }}
          >
            {tab === "qrng" && (
              <Pending state={qrng} file="qrng.json">
                {(d) => <QrngPanel d={d} />}
              </Pending>
            )}
            {tab === "shor" && (
              <Pending state={shor} file="shor.json">
                {(d) => <ShorPanel d={d} />}
              </Pending>
            )}
            {tab === "grover" && (
              <Pending state={grover} file="grover.json">
                {(d) => <GroverPanel d={d} />}
              </Pending>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="mt-10 max-w-[80ch] border-t border-line pt-5 text-[0.8125rem] leading-relaxed text-ash">
        Simulado con Qiskit Aer, sin hardware IBM real. No es QKD. El QRNG simulado es didáctico.
        {summary.status === "ready" && (
          <span className="text-smoke">
            {" "}
            Versiones: Qiskit {summary.data.qiskit_version}, Aer {summary.data.aer_version}.
          </span>
        )}
      </p>
    </Shell>
  );
}
