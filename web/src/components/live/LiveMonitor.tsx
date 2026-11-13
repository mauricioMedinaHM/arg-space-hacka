"use client";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import type { MapPoint } from "@/lib/demo/engine";
import { pointInfo } from "@/lib/demo/engine";
import { CONFIDENCE_LABEL, FRP_STOPS, SATELLITE_NAME, describeSource, totals as computeTotals } from "@/lib/live/source";
import { detectionTime, formatSalta, formatUtc } from "@/lib/live/time";
import { isPasses, isWeather, usePolling } from "@/lib/live/usePolling";
import { useSignedStream } from "@/lib/live/useSignedStream";
import type { PassesResponse, WeatherResponse } from "@/lib/live/types";
import type { WindMark } from "@/components/demo/FireMap";
import { LazyMap } from "@/components/demo/LazyMap";
import { SectionHeading, Shell } from "@/components/ui/Section";
import { LiveKpis } from "./LiveKpis";
import { PassesPanel } from "./PassesPanel";
import { StatusHeader } from "./StatusHeader";
import { StreamLog } from "./StreamLog";
import { RelativeTime } from "./Ticking";
import { VerifyLane } from "./VerifyLane";
import { WeatherPanel } from "./WeatherPanel";

const ease = [0.16, 1, 0.3, 1] as const;
const WEATHER_MS = 10 * 60 * 1000;
const PASSES_MS = 30 * 60 * 1000;
const FRP_GRADIENT = `linear-gradient(90deg, ${FRP_STOPS.map(([, c]) => c).join(", ")})`;

function Legend({ wind }: { wind: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.75rem] text-ash">
      <li className="flex items-center gap-2">
        <span className="font-mono text-[0.6875rem] text-smoke">{FRP_STOPS[0][0]}</span>
        <span className="h-2 w-20 rounded-full" style={{ background: FRP_GRADIENT }} aria-hidden />
        <span className="font-mono text-[0.6875rem] text-smoke">{FRP_STOPS[FRP_STOPS.length - 1][0]}+ MW</span>
        <span>Foco con firma verificada · color y tamaño según FRP</span>
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="m1.5 1.5 7 7M8.5 1.5l-7 7" stroke="var(--color-bad)" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Foco de un lote rechazado
      </li>
      {wind && (
        <li className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M9 15.5V3M4.5 7.2 9 2.5l4.5 4.7" stroke="var(--color-azul-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Hacia dónde sopla el viento
        </li>
      )}
    </ul>
  );
}

export function LiveMonitor() {
  const { snap, refresh } = useSignedStream();
  const weather = usePolling<WeatherResponse>("/api/weather", WEATHER_MS, isWeather);
  const passes = usePolling<PassesResponse>("/api/passes?hours=24", PASSES_MS, isPasses);

  const src = snap.hello ? describeSource(snap.hello.source, snap.hello.origin) : null;
  const live = src?.live ?? false;

  // Con el snapshot de respaldo, el escenario sintético nunca se dibuja en un mapa "en tiempo real".
  const shown = useMemo(
    () => (live ? snap.detections : snap.detections.filter((d) => d.det.source !== "synthetic")),
    [snap.detections, live],
  );
  const hiddenSynthetic = snap.detections.length - shown.length;

  const points = useMemo<MapPoint[]>(
    () =>
      shown.map(({ det, seq, verified, fresh }) => ({
        key: det.id,
        lng: det.longitude,
        lat: det.latitude,
        frp: det.frp,
        status: verified ? "ok" : "bad",
        fresh,
        info: pointInfo(det, seq),
      })),
    [shown],
  );

  const accepted = useMemo(() => shown.filter((d) => d.verified).map((d) => d.det), [shown]);
  const totals = useMemo(() => computeTotals(accepted, detectionTime), [accepted]);
  const recent = useMemo(
    () => [...accepted].sort((a, b) => detectionTime(b) - detectionTime(a)).slice(0, 5),
    [accepted],
  );

  const wind = useMemo<WindMark[] | undefined>(
    () =>
      weather.data?.points.map((p) => ({
        key: p.name,
        lng: p.lon,
        lat: p.lat,
        label: p.name,
        dirDeg: p.wind_dir_deg,
        kmh: p.wind_kmh,
      })),
    [weather.data],
  );

  const cycleDone = snap.stats.cycles > 0 && snap.phase !== "streaming" && snap.phase !== "connecting";
  const empty = cycleDone && shown.length === 0;

  return (
    <Shell id="monitor">
      <SectionHeading title="Monitor en tiempo real: Salta ahora">
        <p>
          El servidor consulta NASA FIRMS, arma lotes y los firma con ML-DSA-65. Tu navegador los recibe por un flujo de eventos
          y comprueba cada firma con la clave pública del recolector antes de dibujar un solo foco.
        </p>
      </SectionHeading>

      <motion.div
        className="overflow-hidden rounded-lg border border-line-strong bg-coal shadow-[0_40px_80px_-40px_rgb(0_0_0/0.9)]"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-8% 0px" }}
        transition={{ duration: 0.8, ease }}
      >
        <StatusHeader snap={snap} onRefresh={refresh} />
        <VerifyLane snap={snap} />

        <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
            <div className="relative h-[22rem] sm:h-[28rem] lg:h-auto lg:min-h-[32rem] lg:flex-1">
              <LazyMap
                points={points}
                focus="salta"
                colorBy="frp"
                wind={wind}
                landmark={false}
                label="Mapa de focos de calor detectados en Salta, con el estado de verificación de cada uno"
              />
              <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-4.5rem)] flex-col items-start gap-1.5">
                <div className="rounded-sm bg-ink/85 px-2.5 py-1.5 font-mono text-[0.6875rem] text-bone">
                  {points.length} {points.length === 1 ? "foco" : "focos"} · {live ? "últimas 24 h" : src ? "snapshot" : "esperando datos"}
                </div>
                {src && !live && (
                  <div className="rounded-sm border border-gold/50 bg-ink/90 px-2.5 py-1.5 text-[0.75rem] leading-snug text-gold">
                    Snapshot congelado, no es en vivo
                    {hiddenSynthetic > 0 && ` · ${hiddenSynthetic} focos sintéticos omitidos`}
                  </div>
                )}
              </div>

              <AnimatePresence>
                {empty && (
                  <motion.div
                    key="vacio"
                    className="absolute inset-x-3 bottom-3 rounded-md border border-line-strong bg-ink/92 p-4 backdrop-blur-sm sm:inset-x-auto sm:left-3 sm:max-w-sm"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.5, ease }}
                  >
                    <h4 className="text-[0.9375rem] font-semibold text-bone">
                      {live ? "Sin focos en Salta en las últimas 24 h" : "No hay focos para mostrar"}
                    </h4>
                    <p className="mt-1.5 text-[0.8125rem] leading-snug text-ash">
                      {live
                        ? "FIRMS no informó detecciones en el recuadro provincial. Eso no garantiza que no haya fuego: nubes, humo o un incendio entre pasadas pueden ocultarlo."
                        : "El servidor no pudo consultar FIRMS y no hay detecciones reales en el respaldo."}
                    </p>
                    <a
                      href="#demo"
                      className="mt-3 inline-flex min-h-9 items-center rounded-md border border-gold/70 px-3 text-[0.8125rem] font-medium text-gold transition-colors hover:bg-gold hover:text-ink"
                    >
                      Ver la reconstrucción sintética de Cafayate en el sandbox
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="border-t border-line px-4 py-3 sm:px-5">
              <Legend wind={!!wind?.length} />
            </div>

            {recent.length > 0 && (
              <div className="border-t border-line">
                <table className="w-full text-left text-[0.8125rem]">
                  <caption className="px-4 pb-2 pt-3.5 text-left text-[0.9375rem] font-semibold text-bone sm:px-5">
                    Detecciones más recientes
                    <span className="ml-2 font-mono text-xs font-normal text-smoke">tocá un foco del mapa para ver su detalle</span>
                  </caption>
                  <thead className="font-mono text-[0.6875rem] text-smoke">
                    <tr>
                      <th scope="col" className="py-1.5 pl-4 pr-3 font-normal sm:pl-5">Satélite</th>
                      <th scope="col" className="px-3 py-1.5 font-normal">Hora de Salta</th>
                      <th scope="col" className="hidden px-3 py-1.5 font-normal sm:table-cell">UTC</th>
                      <th scope="col" className="px-3 py-1.5 text-right font-normal">FRP</th>
                      <th scope="col" className="hidden py-1.5 pl-3 pr-5 font-normal min-[480px]:table-cell">Confianza</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {recent.map((d) => {
                      const t = detectionTime(d);
                      return (
                        <tr key={d.id} className="border-t border-line">
                          <td className="py-2 pl-4 pr-3 font-sans text-[0.8125rem] font-medium text-bone sm:pl-5">
                            {SATELLITE_NAME[d.satellite] ?? d.satellite}
                          </td>
                          <td className="px-3 py-2 text-ash">
                            {formatSalta(t)}{" "}
                            <span className="hidden text-smoke sm:inline">
                              · <RelativeTime ms={t} />
                            </span>
                          </td>
                          <td className="hidden px-3 py-2 text-smoke sm:table-cell">{formatUtc(t, false)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gold">
                            {d.frp.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MW
                          </td>
                          <td className="hidden py-2 pl-3 pr-5 text-ash min-[480px]:table-cell">{CONFIDENCE_LABEL[d.confidence] ?? d.confidence}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-col">
            <StreamLog snap={snap} />
          </div>
        </div>

        <LiveKpis
          totals={totals}
          stats={snap.stats}
          live={live}
          latestLabel={recent[0] ? `${SATELLITE_NAME[recent[0].satellite] ?? recent[0].satellite} · ${formatSalta(detectionTime(recent[0]))} hora de Salta` : undefined}
        />

        <p className="border-t border-line px-4 py-3.5 text-[0.8125rem] leading-snug text-ash sm:px-5">
          Este monitor sólo verifica. Para alterar, duplicar o falsificar lotes y ver cómo reacciona el verificador, usá el{" "}
          <a href="#demo" className="text-azul-soft underline underline-offset-2 hover:text-gold">
            sandbox de ataques
          </a>
          , que puede reproducir estos mismos lotes firmados por el servidor.
        </p>
      </motion.div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <WeatherPanel weather={weather} />
        <PassesPanel passes={passes} />
      </div>
    </Shell>
  );
}
