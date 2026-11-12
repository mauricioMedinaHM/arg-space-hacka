// Web Worker: la verificación ML-DSA-65 de cada lote corre fuera del hilo principal.
import { Verifier } from "../pipeline/verifier";
import type { SignedBatch } from "../types";

type Req =
  | { type: "init"; publicKey: Uint8Array; streamId?: string }
  | { type: "ingest"; id: number; batch: SignedBatch }
  | { type: "finalize"; id: number; expected?: number };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Req>) => void) | null;
  postMessage: (msg: unknown) => void;
};

let verifier: Verifier | null = null;

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") {
    verifier = new Verifier([m.publicKey], m.streamId ? { streamId: m.streamId } : {});
    return;
  }
  if (!verifier) {
    ctx.postMessage({ id: m.id, error: "verificador sin inicializar" });
    return;
  }
  if (m.type === "ingest") {
    ctx.postMessage({ id: m.id, result: verifier.ingest(m.batch) });
  } else {
    ctx.postMessage({
      id: m.id,
      info: {
        lost: verifier.finalize(m.expected).map((r) => r.seq),
        expected: verifier.expectedSeq,
        declaredTotal: verifier.declaredTotal,
      },
    });
  }
};
