// Verificador asíncrono: en el navegador usa un Web Worker (no bloquea el hilo principal);
// sin Worker (tests, navegadores viejos) o si el worker falla, verifica en el mismo hilo.
import { Verifier } from "../pipeline/verifier";
import type { SignedBatch, VerificationResult } from "../types";

export interface FinalizeInfo {
  /** Todos los seq que nunca llegaron (huecos intermedios y lotes cortados al final). */
  lost: number[];
  /** Próximo seq que se esperaba: los perdidos ≥ este valor son un corte al final del flujo. */
  expected: number;
  /** Total de la sesión firmado dentro de los lotes aceptados (null si el emisor no lo firmó). */
  declaredTotal: number | null;
}

export interface AsyncVerifier {
  ingest(batch: SignedBatch): Promise<VerificationResult>;
  finalize(expected?: number): Promise<FinalizeInfo>;
  dispose(): void;
  /** "worker" si verifica fuera del hilo principal. */
  readonly mode: "worker" | "main";
}

export type VerifierFactory = (publicKey: Uint8Array, streamId?: string) => AsyncVerifier;

export const localVerifier: VerifierFactory = (publicKey, streamId) => {
  const v = new Verifier([publicKey], streamId ? { streamId } : {});
  return {
    mode: "main",
    ingest: async (b) => v.ingest(b),
    finalize: async (expected) => ({
      lost: v.finalize(expected).map((r) => r.seq),
      expected: v.expectedSeq,
      declaredTotal: v.declaredTotal,
    }),
    dispose: () => {},
  };
};

type Pending = { resolve: (v: never) => void; run: (local: AsyncVerifier) => Promise<unknown>; ingest: boolean };

export const workerVerifier: VerifierFactory = (publicKey, streamId) => {
  let worker: Worker | null;
  let fallback: AsyncVerifier | null = null;
  let disposed = false;
  let nextId = 0;
  const pending = new Map<number, Pending>();
  const history: SignedBatch[] = [];

  /** Si el worker no arranca o muere, se rehace el estado en el hilo principal y se completan los pendientes. */
  const degrade = async () => {
    if (fallback || disposed) return;
    worker?.terminate();
    worker = null;
    const local = localVerifier(publicKey, streamId);
    fallback = local;
    const waiting = [...pending.values()];
    pending.clear();
    const settled = history.length - waiting.filter((p) => p.ingest).length;
    for (let i = 0; i < Math.max(0, settled); i++) await local.ingest(history[i]);
    for (const p of waiting) p.resolve((await p.run(local)) as never);
  };

  try {
    worker = new Worker(new URL("./verify.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: VerificationResult; info?: FinalizeInfo; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      if (e.data.error) {
        void degrade();
        return;
      }
      pending.delete(e.data.id);
      p.resolve((e.data.result ?? e.data.info) as never);
    };
    worker.onerror = () => void degrade();
    worker.postMessage({ type: "init", publicKey, streamId });
  } catch {
    worker = null;
    fallback = localVerifier(publicKey, streamId);
  }

  const call = <T,>(msg: object, ingest: boolean, run: (local: AsyncVerifier) => Promise<T>): Promise<T> => {
    if (fallback) return run(fallback);
    return new Promise<T>((resolve) => {
      const id = ++nextId;
      pending.set(id, { resolve: resolve as (v: never) => void, run, ingest });
      worker!.postMessage({ ...msg, id });
    });
  };

  return {
    get mode() {
      return fallback ? ("main" as const) : ("worker" as const);
    },
    ingest(batch) {
      history.push(batch);
      return call({ type: "ingest", batch }, true, (local) => local.ingest(batch));
    },
    finalize(expected) {
      return call({ type: "finalize", expected }, false, (local) => local.finalize(expected));
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      pending.clear();
    },
  };
};

export const createVerifier: VerifierFactory = (publicKey, streamId) =>
  typeof Worker !== "undefined" ? workerVerifier(publicKey, streamId) : localVerifier(publicKey, streamId);
