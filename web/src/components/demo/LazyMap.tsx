"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";

const placeholder = (
  <div className="flex h-full items-center justify-center font-mono text-xs text-smoke">Cargando mapa…</div>
);

const FireMap = dynamic(() => import("./FireMap"), { ssr: false, loading: () => placeholder });

/**
 * Monta el mapa (y descarga MapLibre) recién cuando su contenedor se acerca al viewport.
 * Una vez montado se conserva, para no perder la posición ni recrear el contexto WebGL.
 */
export function LazyMap(props: ComponentProps<typeof FireMap>) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near || !box.current) return;
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setNear(true));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(box.current);
    return () => io.disconnect();
  }, [near]);

  return (
    <div ref={box} className="h-full w-full">
      {near ? <FireMap {...props} /> : placeholder}
    </div>
  );
}
