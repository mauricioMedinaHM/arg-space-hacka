"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PollStore, type PollSnapshot } from "./pollStore";
import type { PassesResponse, WeatherResponse } from "./types";

const isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

/** Sondea `url` cada `intervalMs`; se pausa con la pestaña oculta y se limpia al desmontar. */
export function usePolling<T>(
  url: string,
  intervalMs: number,
  validate: (x: unknown) => x is T,
): PollSnapshot<T> & { refresh: () => void } {
  const [store] = useState(() => new PollStore<T>(url, intervalMs, validate));
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    const onVisibility = () => store.setVisible(isVisible());
    store.setVisible(isVisible());
    store.start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      store.stop();
    };
  }, [store]);

  return { ...snap, refresh: () => store.refresh() };
}

export const isWeather = (x: unknown): x is WeatherResponse =>
  !!x && Array.isArray((x as WeatherResponse).points);

export const isPasses = (x: unknown): x is PassesResponse =>
  !!x && Array.isArray((x as PassesResponse).passes);
