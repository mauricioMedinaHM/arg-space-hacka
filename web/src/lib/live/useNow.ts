"use client";
import { useSyncExternalStore } from "react";

// Reloj compartido de 1 s. Devuelve 0 en el servidor y antes de montar (evita desajustes de hidratación):
// los consumidores deben tratar 0 como "todavía sin hora".
const listeners = new Set<() => void>();
let current = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  current = Date.now();
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (timer === null) {
    current = Date.now();
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const get = () => current;
const getServer = () => 0;

export function useNow(): number {
  return useSyncExternalStore(subscribe, get, getServer);
}
