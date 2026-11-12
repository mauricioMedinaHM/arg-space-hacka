"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MlMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { MapPoint } from "@/lib/demo/engine";

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
    properties: { frp: number; status: string; fresh: boolean };
  }[];
};

function toFC(points: MapPoint[]): FC {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { frp: p.frp, status: p.status, fresh: p.fresh },
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

export default function FireMap({ points, focus }: { points: MapPoint[]; focus: "cafayate" | "salta" }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const pointsRef = useRef(points);
  const [failed, setFailed] = useState(false);
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
    new Marker({ element: tag, anchor: "left", offset: [-7, 0] }).setLngLat(CAFAYATE).addTo(map);

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
          "circle-color": FIRE,
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
          "circle-stroke-color": ["match", ["get", "status"], "reordered", AMBER, FIRE],
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
          "circle-color": ["match", ["get", "status"], "reordered", "rgba(255,181,46,0.12)", FIRE],
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

      if (!reduce) {
        pulse = animate(0, 1, {
          duration: 1.7,
          repeat: Infinity,
          ease: "easeOut",
          onUpdate: (v) => {
            if (!map.getLayer("dets-pulse")) return;
            map.setPaintProperty("dets-pulse", "circle-radius", ["+", ["*", RADIUS, 1.2], v * 20] as never);
            map.setPaintProperty("dets-pulse", "circle-stroke-opacity", (1 - v) * 0.9);
          },
        });
      } else {
        map.setPaintProperty("dets-pulse", "circle-stroke-opacity", 0.8);
        map.setPaintProperty("dets-pulse", "circle-radius", ["+", RADIUS, 5] as never);
      }
    });

    return () => {
      pulse?.stop();
      readyRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, [reduce]);

  useEffect(() => {
    pointsRef.current = points;
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("dets") as GeoJSONSource | undefined)?.setData(toFC(points) as never);
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
  return <div ref={el} className="h-full w-full" role="application" aria-label="Mapa de focos de calor verificados en Salta" />;
}
