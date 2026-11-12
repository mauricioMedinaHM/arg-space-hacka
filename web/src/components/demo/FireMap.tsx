"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import "./firemap.css";
import { Map as MlMap, Marker, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { MapPoint } from "@/lib/demo/engine";
import { CONFIDENCE_LABEL, FRP_STOPS, SATELLITE_NAME, compass } from "@/lib/live/source";
import { detectionTime, formatSalta, formatUtc } from "@/lib/live/time";

/** Marca de viento sobre el mapa: la flecha apunta hacia donde va el aire. */
export interface WindMark {
  key: string;
  lng: number;
  lat: number;
  label: string;
  /** Dirección meteorológica (de dónde viene el viento), en grados. */
  dirDeg: number;
  kmh: number;
}

const SALTA: [number, number] = [-65.4, -24.8];
const CAFAYATE: [number, number] = [-65.97, -26.07];

// CARTO dark_all ya no sirve teselas sin API key (devuelve una marca de agua "API KEY REQUIRED").
// Base principal: OpenFreeMap "dark" (vectorial, libre, sin clave). Respaldo: Esri Dark Gray (ráster).
const PRIMARY_STYLE = "https://tiles.openfreemap.org/styles/dark";
const FALLBACK_STYLE = {
  version: 8 as const,
  sources: {
    base: {
      type: "raster" as const,
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
      attribution: "Esri, HERE, Garmin, © OpenStreetMap",
    },
    labels: {
      type: "raster" as const,
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
    },
  },
  layers: [
    { id: "base", type: "raster" as const, source: "base" },
    { id: "labels", type: "raster" as const, source: "labels" },
  ],
};

const FIRE = "#ff6a1f";
const AMBER = "#ffb52e";
const BAD = "#ff5263";

type FC = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { key: string; frp: number; status: string; fresh: boolean };
  }[];
};

function toFC(points: MapPoint[]): FC {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { key: p.key, frp: p.frp, status: p.status, fresh: p.fresh },
    })),
  };
}

/** Ícono "X" rojo para lotes alterados o falsificados. */
function crossImage(): ImageData | null {
  const size = 40;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(11,10,9,0.9)";
  ctx.lineWidth = 11;
  const x = () => {
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(30, 30);
    ctx.moveTo(30, 10);
    ctx.lineTo(10, 30);
    ctx.stroke();
  };
  x();
  ctx.strokeStyle = BAD;
  ctx.lineWidth = 5.5;
  x();
  return ctx.getImageData(0, 0, size, size);
}

const RADIUS = ["interpolate", ["linear"], ["sqrt", ["max", ["get", "frp"], 0]], 0, 3, 3, 4.5, 8, 9, 16, 15];
/** Ondas que da el pulso por cada tanda de focos nuevos antes de quedar fijo. */
const PULSE_WAVES = 3;
const FRP_COLOR = ["interpolate", ["linear"], ["max", ["get", "frp"], 0], ...FRP_STOPS.flat()];

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Contenido del popup armado con textContent (los datos vienen de la red: nunca innerHTML). */
function popupContent(p: MapPoint): HTMLElement {
  const root = node("div");
  const info = p.info;
  const title = node("div", "fire-popup__title");
  const dot = node("span", "fire-popup__dot");
  dot.style.background = p.status === "bad" ? BAD : p.status === "reordered" ? AMBER : FIRE;
  title.append(dot, node("span", undefined, info ? `${SATELLITE_NAME[info.satellite] ?? info.satellite} · ${info.instrument}` : "Foco de calor"));
  root.append(title);

  const status = node(
    "div",
    "fire-popup__status",
    p.status === "bad"
      ? "✕ Lote rechazado: dato no confiable"
      : p.status === "reordered"
        ? "✓ Firma válida · lote fuera de orden"
        : "✓ Firma ML-DSA-65 verificada",
  );
  status.style.color = p.status === "bad" ? BAD : p.status === "reordered" ? AMBER : "#4bd58f";
  root.append(status);

  const dl = node("dl", "fire-popup__grid");
  const row = (k: string, v: string) => dl.append(node("dt", undefined, k), node("dd", undefined, v));
  if (info) {
    const t = detectionTime(info);
    row("Hora UTC", formatUtc(t));
    row("Hora Salta", `${formatSalta(t)} (UTC−3)`);
  }
  row("FRP", `${p.frp.toLocaleString("es-AR", { maximumFractionDigits: 1 })} MW`);
  if (info) {
    row("Confianza", CONFIDENCE_LABEL[info.confidence] ?? info.confidence);
    row("Pasada", info.daynight === "N" ? "nocturna" : "diurna");
    if (info.seq !== undefined) row("Lote", `#${info.seq}`);
    if (info.source === "synthetic") row("Origen", "sintético (no es satelital)");
  }
  row("Posición", `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`);
  root.append(dl);
  return root;
}

const ARROW_SVG =
  '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 15.5V3M4.5 7.2 9 2.5l4.5 4.7" stroke="#45d9e3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export default function FireMap({
  points,
  focus,
  colorBy = "status",
  wind,
  label = "Mapa de focos de calor verificados en Salta",
  landmark = true,
}: {
  points: MapPoint[];
  focus: "cafayate" | "salta";
  /** "frp": el relleno de los focos válidos sigue la rampa de FRP (monitor en vivo). */
  colorBy?: "status" | "frp";
  wind?: WindMark[];
  label?: string;
  /** Marca fija de Cafayate (referencia del escenario histórico). */
  landmark?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const pointsRef = useRef(points);
  const pulseRef = useRef<() => void>(() => {});
  const visibleRef = useRef(true);
  const windRef = useRef(new Map<string, { marker: Marker; el: HTMLElement }>());
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!el.current) return;
    let map: MlMap;
    try {
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new MlMap({
        container: el.current,
        center: SALTA,
        zoom: el.current.clientWidth < 520 ? 5.2 : 6,
        minZoom: 4,
        maxZoom: 13,
        attributionControl: { compact: true },
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": "Usá Ctrl + rueda para acercar el mapa",
          "CooperativeGesturesHandler.MacHelpText": "Usá ⌘ + rueda para acercar el mapa",
          "CooperativeGesturesHandler.MobileHelpText": "Usá dos dedos para mover el mapa",
          "NavigationControl.ZoomIn": "Acercar",
          "NavigationControl.ZoomOut": "Alejar",
          "Map.Title": "Mapa",
          "AttributionControl.ToggleAttribution": "Mostrar atribución",
        },
        style: PRIMARY_STYLE,
      });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.touchZoomRotate.disableRotation();

    const tag = document.createElement("div");
    tag.className = "pointer-events-none flex items-center gap-2";
    tag.innerHTML =
      '<span style="width:14px;height:14px;border:1px solid #f3eee6;border-radius:50%;display:block;box-shadow:0 0 0 3px rgba(11,10,9,.55)"></span>' +
      '<span style="font:500 10px var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:#f3eee6;background:rgba(11,10,9,.8);padding:2px 6px;border-radius:2px">Cafayate</span>';
    if (landmark) new Marker({ element: tag, anchor: "left", offset: [-7, 0] }).setLngLat(CAFAYATE).addTo(map);

    let pulse: { stop: () => void } | null = null;
    let swapped = false;
    map.on("error", () => {
      // Si el estilo principal no carga, se pasa una sola vez al respaldo ráster.
      if (readyRef.current || swapped) return;
      swapped = true;
      map.setStyle(FALLBACK_STYLE);
    });

    map.on("load", () => {
      const img = crossImage();
      const okFill = colorBy === "frp" ? FRP_COLOR : FIRE;
      if (img) map.addImage("x-bad", img, { pixelRatio: 2 });
      map.addSource("dets", { type: "geojson", data: toFC(pointsRef.current) });
      const valid = ["!=", ["get", "status"], "bad"];
      map.addLayer({
        id: "dets-glow",
        type: "circle",
        source: "dets",
        filter: ["==", ["get", "status"], "ok"],
        paint: {
          "circle-radius": ["*", RADIUS, 2.6],
          "circle-color": okFill,
          "circle-blur": 1,
          "circle-opacity": 0.22,
        },
      } as never);
      map.addLayer({
        id: "dets-pulse",
        type: "circle",
        source: "dets",
        filter: ["all", valid, ["==", ["get", "fresh"], true]],
        paint: {
          "circle-radius": 8,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": ["match", ["get", "status"], "reordered", AMBER, okFill],
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": 0,
        },
      } as never);
      map.addLayer({
        id: "dets-core",
        type: "circle",
        source: "dets",
        filter: valid,
        paint: {
          "circle-radius": RADIUS,
          "circle-color": ["match", ["get", "status"], "reordered", "rgba(255,181,46,0.12)", okFill],
          "circle-opacity": ["match", ["get", "status"], "reordered", 1, 0.9],
          "circle-stroke-color": ["match", ["get", "status"], "reordered", AMBER, "#ffd9a8"],
          "circle-stroke-width": ["match", ["get", "status"], "reordered", 2, 0.75],
        },
      } as never);
      map.addLayer({
        id: "dets-bad",
        type: "symbol",
        source: "dets",
        filter: ["==", ["get", "status"], "bad"],
        layout: { "icon-image": "x-bad", "icon-allow-overlap": true, "icon-ignore-placement": true },
      } as never);
      readyRef.current = true;

      // Popup con el detalle del foco.
      let popup: Popup | null = null;
      for (const layer of ["dets-core", "dets-bad"]) {
        map.on("click", layer, (e) => {
          const key = e.features?.[0]?.properties?.key;
          const p = pointsRef.current.find((x) => x.key === key);
          if (!p) return;
          popup?.remove();
          popup = new Popup({ className: "fire-popup", offset: 12, maxWidth: "none", closeButton: true })
            .setLngLat([p.lng, p.lat])
            .setDOMContent(popupContent(p))
            .addTo(map);
          popup.getElement()?.querySelector(".maplibregl-popup-close-button")?.setAttribute("aria-label", "Cerrar detalle del foco");
        });
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      setLoaded(true);

      // Pulso de los focos nuevos: unas pocas ondas y queda un anillo fijo. Nada de repintar WebGL
      // a 60 fps para siempre, ni mientras el mapa está fuera de pantalla.
      const settle = () => {
        if (!map.getLayer("dets-pulse")) return;
        map.setPaintProperty("dets-pulse", "circle-stroke-opacity", 0.7);
        map.setPaintProperty("dets-pulse", "circle-radius", ["+", RADIUS, 5] as never);
      };
      let running = false;
      let again = false;
      const run = () => {
        if (reduce || !visibleRef.current) return settle();
        if (running) {
          again = true;
          return;
        }
        running = true;
        pulse = animate(0, 1, {
          duration: 1.7,
          repeat: PULSE_WAVES - 1,
          ease: "easeOut",
          onUpdate: (v) => {
            if (!map.getLayer("dets-pulse")) return;
            map.setPaintProperty("dets-pulse", "circle-radius", ["+", ["*", RADIUS, 1.2], v * 20] as never);
            map.setPaintProperty("dets-pulse", "circle-stroke-opacity", (1 - v) * 0.9);
          },
          onComplete: () => {
            running = false;
            if (again) {
              again = false;
              run();
            } else settle();
          },
        });
      };
      pulseRef.current = run;
      if (pointsRef.current.some((p) => p.fresh)) run();
      else settle();
    });

    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            visibleRef.current = entry.isIntersecting;
          });
    io?.observe(el.current);

    const marks = windRef.current;
    return () => {
      io?.disconnect();
      pulseRef.current = () => {};
      pulse?.stop();
      readyRef.current = false;
      mapRef.current = null;
      marks.clear();
      setLoaded(false);
      map.remove();
    };
  }, [reduce, colorBy, landmark]);

  // Marcas de viento (marcadores DOM): se crean, actualizan y quitan según `wind`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const marks = windRef.current;
    const seen = new Set<string>();
    for (const w of wind ?? []) {
      if (!Number.isFinite(w.lng) || !Number.isFinite(w.lat)) continue;
      seen.add(w.key);
      let m = marks.get(w.key);
      if (!m) {
        const root = document.createElement("div");
        root.className = "wind-mark";
        root.innerHTML = ARROW_SVG; // constante local, sin datos externos
        root.append(node("span", "wind-mark__label"));
        m = { el: root, marker: new Marker({ element: root, anchor: "left", offset: [-9, 0] }).setLngLat([w.lng, w.lat]).addTo(map) };
        marks.set(w.key, m);
      }
      const svg = m.el.querySelector("svg");
      // dirDeg es de dónde viene el viento; la flecha (que apunta al norte) se gira hacia donde va.
      if (svg && Number.isFinite(w.dirDeg)) svg.style.transform = `rotate(${(w.dirDeg + 180) % 360}deg)`;
      const text = m.el.querySelector(".wind-mark__label");
      if (text) text.textContent = `${w.label} · ${Math.round(w.kmh)} km/h`;
      m.el.title = `Viento desde el ${compass(w.dirDeg)}`;
    }
    for (const [key, m] of marks) {
      if (!seen.has(key)) {
        m.marker.remove();
        marks.delete(key);
      }
    }
  }, [wind, loaded]);

  useEffect(() => {
    pointsRef.current = points;
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("dets") as GeoJSONSource | undefined)?.setData(toFC(points) as never);
    if (points.some((p) => p.fresh)) pulseRef.current();
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const narrow = (el.current?.clientWidth ?? 800) < 520;
    const target =
      focus === "cafayate"
        ? { center: [-65.3, -25.0] as [number, number], zoom: narrow ? 5.3 : 6.2 }
        : { center: SALTA, zoom: narrow ? 5.2 : 6 };
    map.easeTo({ ...target, duration: reduce ? 0 : 900 });
  }, [focus, reduce]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ash">
        No se pudo iniciar el mapa (WebGL no disponible). La verificación sigue funcionando: mirá el registro de lotes.
      </div>
    );
  }
  return <div ref={el} className="h-full w-full" role="region" aria-label={label} />;
}
