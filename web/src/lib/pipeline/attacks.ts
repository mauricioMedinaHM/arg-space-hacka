import type { AttackKind, SignedBatch } from "../types";
import { Collector } from "./collector";
import { generateKeyPair } from "./keys";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export const ATTACK_LABELS: Record<AttackKind, { title: string; desc: string }> = {
  tamper: { title: "Alterar", desc: "Modifica el FRP y la posición de un foco dentro de un lote firmado." },
  duplicate: { title: "Duplicar", desc: "Reinyecta un lote ya enviado (ataque de replay)." },
  drop: { title: "Suprimir", desc: "Elimina un lote del flujo (pérdida o censura)." },
  reorder: { title: "Reordenar", desc: "Intercambia el orden de dos lotes consecutivos." },
  forge: { title: "Falsificar", desc: "Inserta un lote firmado con una clave ML-DSA ajena." },
};

/** Aplica un ataque sobre el lote `index` del flujo. Devuelve un nuevo arreglo. */
export function applyAttack(stream: SignedBatch[], kind: AttackKind, index: number): SignedBatch[] {
  const out = stream.map(clone);
  const i = Math.max(0, Math.min(index, out.length - 1));
  if (!out.length) return out;
  switch (kind) {
    case "tamper": {
      const d = out[i].payload.detections[0];
      if (d) {
        d.frp = +(d.frp * 0.1).toFixed(2);
        d.latitude = +(d.latitude + 0.05).toFixed(5);
      } else out[i].payload.created_at = new Date(0).toISOString();
      return out;
    }
    case "duplicate":
      out.splice(i + 1, 0, clone(out[i]));
      return out;
    case "drop":
      out.splice(i, 1);
      return out;
    case "reorder":
      if (i + 1 < out.length) [out[i], out[i + 1]] = [out[i + 1], out[i]];
      return out;
    case "forge":
      out.splice(i, 0, forgeBatch(out[i]));
      return out;
  }
}

/** Lote con apariencia legítima pero firmado por un atacante. */
export function forgeBatch(like: SignedBatch): SignedBatch {
  const attacker = new Collector({ keyPair: generateKeyPair(), streamId: like.payload.stream_id });
  const fake = attacker.makeBatch(
    like.payload.detections.map((d) => ({ ...d, id: `${d.id}-fake`, frp: 0.1, confidence: "l" as const })),
  );
  return fake;
}
