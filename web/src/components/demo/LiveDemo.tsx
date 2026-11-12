"use client";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DemoEngine } from "@/lib/demo/engine";
import { loadHistorical, sortDetections } from "@/lib/firms";
import { ALG, SIZES, generateKeyPair, hexToBytes } from "@/lib/pipeline";
import { fetchQuantum, type QrngData } from "@/lib/quantum";
import type { AttackKind, FireDetection } from "@/lib/types";
import { PauseIcon, PlayIcon, ResetIcon, StepIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/Segmented";
import { SectionHeading, Shell } from "@/components/ui/Section";
import { BatchLog } from "./BatchLog";
import { MetricsBar } from "./MetricsBar";
import { NetworkLane } from "./NetworkLane";

const FireMap = dynamic(() => import("./FireMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-xs text-smoke">Cargando mapa…</div>
  ),
});

type ScenarioId = "cafayate" | "historico" | "live";

type LiveState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; source: string; count: number; fetchedAt?: string; note?: string }
  | { status: "error"; note: string };

const SCENARIOS = [
  { value: "cafayate" as const, label: "Cafayate jun-2026 (sintético)" },
  { value: "historico" as const, label: "Histórico Salta" },
  { value: "live" as const, label: "FIRMS en vivo" },
];
const SPEEDS = [0.5, 1, 2, 4].map((v) => ({ value: v, label: `${String(v).replace(".", ",")}×` }));
const SIZES_OPT = [5, 10, 20].map((v) => ({ value: v, label: String(v) }));

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function range(dets: FireDetection[]) {
  if (!dets.length) return "";
  const dates = dets.map((d) => d.acq_date).sort();
  return `${fmtDate(dates[0])} al ${fmtDate(dates[dates.length - 1])}`;
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.75rem] text-ash">
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-fire" /> Lote válido (tamaño según FRP)
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border-2 border-amber" /> Reordenado
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="m1.5 1.5 7 7M8.5 1.5l-7 7" stroke="var(--color-bad)" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Alterado o falsificado (rechazado)
      </li>
    </ul>
  );
}

export function LiveDemo() {
  const [engine] = useState(() => new DemoEngine());
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const [scenario, setScenario] = useState<ScenarioId>("cafayate");
  const [live, setLive] = useState<LiveState>({ status: "idle" });
  const [keyError, setKeyError] = useState(false);
  const token = useRef(0);

  const local = useMemo(() => {
    const all = loadHistorical();
    return {
      cafayate: all.filter((d) => d.source === "synthetic"),
      historico: all.filter((d) => d.source !== "synthetic"),
    };
  }, []);

  useEffect(() => {
    let alive = true;
    engine.load(local.cafayate);
    fetchQuantum<QrngData>("qrng")
      .then((q) => generateKeyPair(hexToBytes(q.seed_hex)))
      .then(
        (kp) => alive && engine.setKey(kp, "qrng"),
        () => {
          if (!alive) return;
          engine.setKey(generateKeyPair(), "random");
          setKeyError(true);
        },
      );
    return () => {
      alive = false;
      engine.dispose();
    };
  }, [engine, local]);

  async function choose(id: ScenarioId) {
    const t = ++token.current;
    setScenario(id);
    if (id !== "live") {
      setLive({ status: "idle" });
      engine.load(local[id]);
      return;
    }
    setLive({ status: "loading" });
    engine.load([]);
    try {
      const res = await fetch("/api/firms?days=1");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: { source?: string; fetched_at?: string; note?: string; detections?: FireDetection[] } = await res.json();
      if (t !== token.current) return;
      const source = body.source ?? "desconocido";
      let dets = Array.isArray(body.detections) ? body.detections : [];
      if (source !== "firms-live") dets = dets.filter((d) => d.source !== "synthetic");
      if (!dets.length) {
        engine.load(local.historico);
        setLive({
          status: "done",
          source: "historical",
          count: local.historico.length,
          note:
            source === "firms-live"
              ? "FIRMS respondió sin focos en Salta para las últimas 24 h. Se usa el snapshot histórico local."
              : "FIRMS en vivo no está disponible. Se usa el snapshot histórico local.",
        });
        return;
      }
      engine.load(sortDetections(dets));
      setLive({ status: "done", source, count: dets.length, fetchedAt: body.fetched_at, note: body.note });
    } catch {
      if (t !== token.current) return;
      engine.load(local.historico);
      setLive({ status: "error", note: "No se pudo consultar /api/firms. Se usa el snapshot histórico local." });
    }
  }

  const progress = snap.totalBatches ? snap.signed / snap.totalBatches : 0;
  const canRun = snap.ready;

  let scenarioNote: React.ReactNode;
  if (scenario === "cafayate") {
    scenarioNote = (
      <>
        <strong className="font-semibold text-amber">Reconstrucción sintética, no son datos satelitales reales.</strong>{" "}
        {local.cafayate.length} detecciones simuladas del {range(local.cafayate)} en torno a Cafayate y el Chaco salteño.
      </>
    );
  } else if (scenario === "historico") {
    scenarioNote = (
      <>
        Snapshot real de NASA FIRMS (VIIRS 375 m, NRT): {local.historico.length} detecciones del {range(local.historico)},
        congeladas en el repositorio.
      </>
    );
  } else if (live.status === "loading") {
    scenarioNote = "Consultando /api/firms…";
  } else if (live.status === "done") {
    scenarioNote = (
      <>
        La API devolvió <code className="font-mono text-cyan">source: &quot;{live.source}&quot;</code> con {live.count}{" "}
        detecciones
        {live.fetchedAt ? ` (${new Date(live.fetchedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })})` : ""}.{" "}
        {live.source === "firms-live" ? "Datos NRT de las últimas 24 h." : <span className="text-amber">{live.note}</span>}
      </>
    );
  } else if (live.status === "error") {
    scenarioNote = <span className="text-amber">{live.note}</span>;
  }

  return (
    <Shell id="demo">
      <SectionHeading title="Firmá, atacá y verificá un flujo de focos en vivo">
        <p>
          Todo corre en tu navegador. El recolector agrupa detecciones en lotes, los encadena y los firma con{" "}
          {ALG}. Vos manejás la red: alterá, duplicá, suprimí, reordená o falsificá lotes y mirá qué llega al mapa.
        </p>
      </SectionHeading>

      <motion.div
        className="overflow-hidden rounded-lg border border-line-strong bg-coal shadow-[0_40px_80px_-40px_rgb(0_0_0/0.9)]"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-8% 0px" }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Controles */}
        <div className="space-y-4 border-b border-line p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <Segmented label="Escenario" options={SCENARIOS} value={scenario} onChange={choose} tone="fire" />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex items-center gap-2 text-[0.8125rem] text-ash">
                Velocidad
                <Segmented label="Velocidad" options={SPEEDS} value={snap.speed} onChange={(v) => engine.setSpeed(v)} />
              </div>
              <div className="flex items-center gap-2 text-[0.8125rem] text-ash">
                Focos por lote
                <Segmented
                  label="Focos por lote"
                  options={SIZES_OPT}
                  value={snap.batchSize}
                  onChange={(v) => engine.setBatchSize(v)}
                />
              </div>
            </div>
          </div>

          <p className="min-h-5 max-w-[80ch] text-[0.8125rem] leading-snug text-ash" aria-live="polite">
            {scenarioNote}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canRun}
              onClick={() => (snap.playing ? engine.pause() : engine.play())}
              className="inline-flex min-h-11 min-w-[9.5rem] items-center justify-center gap-2 rounded-md bg-fire px-4 text-[0.9375rem] font-semibold text-ink transition-[background-color,transform] duration-150 hover:bg-[#ff8442] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {snap.playing ? <PauseIcon /> : <PlayIcon />}
              {snap.playing ? "Pausar" : snap.done ? "Repetir" : snap.signed > 0 ? "Continuar" : "Reproducir"}
            </button>
            <button
              type="button"
              disabled={!canRun || snap.done}
              onClick={() => engine.step()}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-3.5 text-sm font-medium text-bone transition-colors duration-150 hover:bg-char active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <StepIcon /> Paso
            </button>
            <button
              type="button"
              disabled={!canRun || (snap.signed === 0 && snap.armed.length === 0)}
              onClick={() => engine.reset()}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-3.5 text-sm font-medium text-bone transition-colors duration-150 hover:bg-char active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ResetIcon /> Reiniciar
            </button>
            <div className="ml-auto flex min-w-[10rem] flex-1 items-center gap-3 sm:max-w-xs">
              <div
                className="h-1 flex-1 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label="Lotes firmados"
                aria-valuemin={0}
                aria-valuemax={snap.totalBatches}
                aria-valuenow={snap.signed}
              >
                <motion.div
                  className="h-full origin-left bg-cyan"
                  animate={{ scaleX: progress }}
                  initial={false}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="font-mono text-xs tabular-nums text-ash">
                {snap.signed}/{snap.totalBatches} lotes
              </span>
            </div>
          </div>
        </div>

        <NetworkLane snap={snap} onAttack={(k: AttackKind) => engine.inject(k)} />

        {/* Mapa + registro */}
        <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex flex-col border-b border-line lg:border-b-0 lg:border-r">
            <div className="relative h-[22rem] sm:h-[28rem] lg:h-auto lg:min-h-[34rem] lg:flex-1">
              <FireMap points={snap.points} focus={scenario === "cafayate" ? "cafayate" : "salta"} />
              <div className="pointer-events-none absolute left-3 top-3 rounded-sm bg-ink/85 px-2.5 py-1.5 font-mono text-[0.6875rem] text-bone">
                {snap.points.length} focos trazados
              </div>
            </div>
            <div className="border-t border-line px-4 py-3 sm:px-5">
              <Legend />
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <BatchLog snap={snap} />
          </div>
        </div>

        <div className="border-t border-line">
          <MetricsBar m={snap.metrics} />
        </div>

        {/* Identidad de la clave */}
        <div className="flex flex-col gap-x-8 gap-y-3 border-t border-line px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <div className="text-[0.75rem] text-ash">Clave pública del recolector (key_id)</div>
            <div className="mt-1 break-all font-mono text-sm text-cyan">{snap.keyId ?? "generando clave…"}</div>
          </div>
          <div className="font-mono text-xs leading-relaxed text-ash">
            {ALG} · clave pública {SIZES.publicKey.toLocaleString("es-AR")} B · firma{" "}
            {SIZES.signature.toLocaleString("es-AR")} B
            {snap.metrics.avgSignMs > 0 && <> · firma media {snap.metrics.avgSignMs.toFixed(1)} ms</>}
          </div>
          <div className="text-[0.8125rem] leading-snug text-ash lg:ml-auto lg:max-w-sm lg:text-right">
            {snap.keyOrigin === "qrng" && (
              <>
                Derivada de la semilla del <a href="#cuantica" className="text-violet underline underline-offset-2">QRNG simulado</a>. Es
                una semilla pública, sólo para la demo.
              </>
            )}
            {snap.keyOrigin === "random" && keyError && (
              <span className="text-amber">
                No se pudo leer /quantum/qrng.json: se generó una clave aleatoria local para esta sesión.
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </Shell>
  );
}
