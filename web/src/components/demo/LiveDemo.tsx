"use client";
import { motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { DemoEngine } from "@/lib/demo/engine";
import { ALG, SIZES, generateKeyPair, hexToBytes } from "@/lib/pipeline";
import { describeSource } from "@/lib/live/source";
import { useSignedStream } from "@/lib/live/useSignedStream";
import { fetchQuantum, type QrngData } from "@/lib/quantum";
import type { AttackKind, FireDetection } from "@/lib/types";
import { PauseIcon, PlayIcon, ResetIcon, StepIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/Segmented";
import { SectionHeading, Shell } from "@/components/ui/Section";
import { BatchLog } from "./BatchLog";
import { LazyMap } from "./LazyMap";
import { MetricsBar } from "./MetricsBar";
import { NetworkLane } from "./NetworkLane";

type LocalData = { cafayate: FireDetection[]; historico: FireDetection[] };

type ScenarioId = "cafayate" | "historico" | "live";

type LiveState =
  | { status: "idle" }
  /** Esperando que el monitor termine de recibir un ciclo firmado por el servidor. */
  | { status: "loading" }
  | { status: "server"; label: string; live: boolean; count: number; batches: number; cycle: number }
  | { status: "fallback"; note: string };

const SCENARIOS = [
  { value: "cafayate" as const, label: "Cafayate jun-2026 (sintético)" },
  { value: "historico" as const, label: "Snapshot real Salta" },
  { value: "live" as const, label: "FIRMS en vivo (firmado por el servidor)" },
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
        <span className="h-2.5 w-2.5 rounded-full bg-fire" /> Foco de un lote válido (tamaño según FRP)
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border-2 border-gold" /> Reordenado
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
  const { snap: stream, store: streamStore } = useSignedStream();

  // El snapshot (~160 KB) no viaja en el bundle inicial: se pide aparte al montar el sandbox.
  const [local, setLocal] = useState<LocalData | null>(null);
  const [localError, setLocalError] = useState(false);
  useEffect(() => {
    let alive = true;
    import("@/lib/firms-historical").then(
      (m) => {
        if (!alive) return;
        const all = m.loadHistorical();
        setLocal({
          cafayate: all.filter((d) => d.source === "synthetic"),
          historico: all.filter((d) => d.source !== "synthetic"),
        });
      },
      () => alive && setLocalError(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  // Los escenarios locales (y el respaldo del escenario en vivo) se cargan cuando el snapshot está disponible.
  const liveStatus = live.status;
  useEffect(() => {
    if (!local) return;
    if (scenario !== "live") engine.load(local[scenario]);
    else if (liveStatus === "fallback") engine.load(local.historico);
  }, [local, scenario, liveStatus, engine]);

  useEffect(() => {
    let alive = true;
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
  }, [engine]);

  /** Carga en el sandbox el último ciclo completo que firmó el servidor. Devuelve false si todavía no hay. */
  function loadServerCycle(): boolean {
    const pk = streamStore.trustedPublicKey;
    const cur = streamStore.getSnapshot();
    if (!pk || !cur.collector || cur.stats.cycles === 0) return false;
    const src = describeSource(cur.hello?.source, cur.hello?.origin);
    if (cur.lastBatches.length === 0) {
      setLive({
        status: "fallback",
        note: src.live
          ? "FIRMS no informó focos en Salta en las últimas 24 h, así que no hay lotes del servidor para atacar. Se usa el snapshot real local, firmado en tu navegador."
          : "El servidor no entregó lotes. Se usa el snapshot real local, firmado en tu navegador.",
      });
      return true;
    }
    engine.loadSigned(cur.lastBatches, pk, cur.collector.key_id);
    setLive({
      status: "server",
      label: src.label,
      live: src.live,
      count: cur.lastBatches.reduce((n, b) => n + b.payload.detections.length, 0),
      batches: cur.lastBatches.length,
      cycle: cur.stats.cycles,
    });
    return true;
  }

  function choose(id: ScenarioId) {
    setScenario(id);
    if (id !== "live") {
      setLive({ status: "idle" });
      return;
    }
    if (loadServerCycle()) return;
    engine.load([]);
    setLive({ status: "loading" });
  }

  // Si se eligió "en vivo" antes de que terminara el primer ciclo, se carga apenas esté completo.
  // Si el flujo no logra conectar, se cae al snapshot local para no dejar el sandbox vacío.
  const waitingServer = scenario === "live" && live.status === "loading";
  const streamCycles = stream.stats.cycles;
  const streamDown = stream.phase === "retrying" && stream.attempt >= 2;
  useEffect(() => {
    if (!waitingServer) return;
    if (streamCycles > 0) {
      queueMicrotask(loadServerCycle);
    } else if (streamDown) {
      queueMicrotask(() => {
        setLive({
          status: "fallback",
          note: "No se pudo abrir el flujo firmado del servidor (/api/stream). Se usa el snapshot real local, firmado en tu navegador.",
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadServerCycle lee del store en el momento
  }, [waitingServer, streamCycles, streamDown]);

  const newerCycle = scenario === "live" && live.status === "server" && streamCycles > live.cycle && stream.lastBatches.length > 0;

  const progress = snap.totalBatches ? snap.signed / snap.totalBatches : 0;
  const canRun = snap.ready;

  let scenarioNote: React.ReactNode;
  if (scenario !== "live" && !local) {
    scenarioNote = localError ? (
      <span className="text-gold">No se pudo cargar el snapshot local. Probá con «FIRMS en vivo» o recargá la página.</span>
    ) : (
      "Cargando el snapshot local…"
    );
  } else if (scenario === "cafayate" && local) {
    scenarioNote = (
      <>
        <strong className="font-semibold text-gold">Reconstrucción sintética, no son datos satelitales reales.</strong>{" "}
        {local.cafayate.length} detecciones simuladas del {range(local.cafayate)} en torno a Cafayate y el Chaco salteño.
      </>
    );
  } else if (scenario === "historico" && local) {
    scenarioNote = (
      <>
        Snapshot real de NASA FIRMS (VIIRS 375 m, NRT): {local.historico.length} detecciones del {range(local.historico)},
        congeladas en el repositorio.
      </>
    );
  } else if (live.status === "loading") {
    scenarioNote = "Esperando que termine el ciclo en curso del flujo firmado por el servidor…";
  } else if (live.status === "server") {
    scenarioNote = (
      <>
        <strong className={`font-semibold ${live.live ? "text-azul" : "text-gold"}`}>
          {live.batches} lotes ya firmados por el servidor
        </strong>{" "}
        ({live.count} focos · {live.label}). Son los mismos que verificó el{" "}
        <a href="#monitor" className="text-azul-soft underline underline-offset-2 hover:text-gold">
          monitor en tiempo real
        </a>
        : tu navegador sólo tiene la clave pública, así que cualquier cambio que hagas en la red rompe la firma.
      </>
    );
  } else if (live.status === "fallback") {
    scenarioNote = <span className="text-gold">{live.note}</span>;
  }

  return (
    <Shell id="demo">
      <SectionHeading title="Firmá, atacá y verificá un flujo de focos">
        <p>
          Sandbox de ataques. El recolector agrupa detecciones en lotes, los encadena y los firma con {ALG}. Vos manejás la
          red: alterá, duplicá, suprimí, reordená o falsificá lotes y mirá qué llega al mapa. Los escenarios locales se firman
          en tu navegador; «FIRMS en vivo» reproduce los lotes que firmó el servidor para el{" "}
          <a href="#monitor" className="text-azul-soft underline underline-offset-2 hover:text-gold">
            monitor en tiempo real
          </a>
          .
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
            <Segmented label="Escenario" options={SCENARIOS} value={scenario} onChange={choose} tone="gold" />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex items-center gap-2 text-[0.8125rem] text-ash">
                Velocidad
                <Segmented label="Velocidad" options={SPEEDS} value={snap.speed} onChange={(v) => engine.setSpeed(v)} />
              </div>
              <fieldset
                disabled={snap.presigned}
                className="flex min-w-0 items-center gap-2 text-[0.8125rem] text-ash disabled:opacity-40"
                title={snap.presigned ? "El tamaño de lote lo fijó el servidor al firmar" : undefined}
              >
                Focos por lote
                <Segmented
                  label="Focos por lote"
                  options={SIZES_OPT}
                  value={snap.batchSize}
                  onChange={(v) => engine.setBatchSize(v)}
                />
              </fieldset>
            </div>
          </div>

          <p className="min-h-5 max-w-[80ch] text-[0.8125rem] leading-snug text-ash" aria-live="polite">
            {scenarioNote}
            {newerCycle && (
              <button
                type="button"
                onClick={loadServerCycle}
                className="ml-2 inline-flex min-h-7 items-center rounded-sm border border-gold/60 px-2 text-[0.75rem] font-medium text-gold transition-colors hover:bg-gold hover:text-ink"
              >
                Hay un ciclo más nuevo: cargarlo
              </button>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canRun}
              onClick={() => (snap.playing ? engine.pause() : engine.play())}
              className="inline-flex min-h-11 min-w-[9.5rem] items-center justify-center gap-2 rounded-md bg-gold px-4 text-[0.9375rem] font-semibold text-ink transition-[background-color,transform] duration-150 hover:bg-gold-soft active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
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
                aria-valuemax={Math.max(1, snap.totalBatches)}
                aria-valuenow={snap.signed}
              >
                <motion.div
                  className="h-full origin-left bg-gold"
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
              <LazyMap points={snap.points} focus={scenario === "cafayate" ? "cafayate" : "salta"} />
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
            <div className="text-[0.75rem] text-ash">
              Clave pública del recolector{snap.presigned ? " del servidor" : ""} (key_id)
            </div>
            <div className="mt-1 break-all font-mono text-sm text-azul">{snap.keyId ?? "generando clave…"}</div>
          </div>
          <div className="font-mono text-xs leading-relaxed text-ash">
            {ALG} · clave pública {SIZES.publicKey.toLocaleString("es-AR")} B · firma{" "}
            {SIZES.signature.toLocaleString("es-AR")} B
            {snap.metrics.avgSignMs > 0 && <> · firma media {snap.metrics.avgSignMs.toFixed(1)} ms</>}
          </div>
          <div className="text-[0.8125rem] leading-snug text-ash lg:ml-auto lg:max-w-sm lg:text-right">
            {snap.keyOrigin === "qrng" && (
              <>
                Derivada de la semilla del <a href="#cuantica" className="text-azul-soft underline underline-offset-2">QRNG simulado</a>. Es
                una semilla pública, sólo para la demo.
              </>
            )}
            {snap.keyOrigin === "server" && (
              <>
                Clave pública del recolector del servidor (<code className="font-mono text-azul">/api/collector</code>). La clave
                secreta nunca llega al navegador.
              </>
            )}
            {snap.keyOrigin === "random" && keyError && (
              <span className="text-gold">
                No se pudo leer /quantum/qrng.json: se generó una clave aleatoria local para esta sesión.
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </Shell>
  );
}
