"use client";
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * prefers-reduced-motion seguro para hidratación: en el servidor y en el primer render del cliente
 * devuelve false (mismo marcado en ambos lados) y recién después refleja la preferencia real.
 * `useReducedMotion()` de motion lee la media query durante el render y, si el markup depende de
 * ella, React reporta un desajuste de hidratación.
 */
export function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
