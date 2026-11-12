"use client";
// Hook del flujo firmado: el servidor firma (/api/stream), el navegador verifica con la clave de /api/collector.
import { useEffect, useSyncExternalStore } from "react";
import { LiveStreamStore, type LiveSnapshot } from "./streamStore";

// Un único flujo por página, compartido entre el monitor y el sandbox de ataques.
let shared: LiveStreamStore | null = null;
let users = 0;

function getStore(): LiveStreamStore {
  shared ??= new LiveStreamStore();
  return shared;
}

const isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

export interface SignedStream {
  snap: LiveSnapshot;
  store: LiveStreamStore;
  refresh: () => void;
}

/**
 * Conecta a /api/stream con EventSource y verifica cada SignedBatch en el navegador.
 * Reabre tras `done` según `next_poll_s`, reintenta con espera exponencial, se pausa con la
 * pestaña oculta y cierra todo al desmontar el último consumidor.
 */
export function useSignedStream(): SignedStream {
  const store = getStore();
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    users += 1;
    const onVisibility = () => store.setVisible(isVisible());
    if (users === 1) {
      store.setVisible(isVisible());
      store.start();
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      users -= 1;
      if (users === 0) {
        document.removeEventListener("visibilitychange", onVisibility);
        store.stop();
      }
    };
  }, [store]);

  return { snap, store, refresh: () => store.refresh() };
}
