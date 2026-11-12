import type { ReactNode } from "react";
import type { AttackKind, IntegrityStatus } from "@/lib/types";
import { CheckIcon, CopyIcon, CrossIcon, DropIcon, GapIcon, MaskIcon, PenIcon, SwapIcon } from "@/components/ui/icons";

export type Tone = "ok" | "bad" | "amber" | "violet" | "cyan";

export const TONE: Record<Tone, { text: string; border: string; bg: string; dot: string }> = {
  ok: { text: "text-ok", border: "border-ok/50", bg: "bg-ok/10", dot: "bg-ok" },
  bad: { text: "text-bad", border: "border-bad/60", bg: "bg-bad/10", dot: "bg-bad" },
  amber: { text: "text-amber", border: "border-amber/50", bg: "bg-amber/10", dot: "bg-amber" },
  violet: { text: "text-violet", border: "border-violet/50", bg: "bg-violet/10", dot: "bg-violet" },
  cyan: { text: "text-cyan", border: "border-cyan/50", bg: "bg-cyan/10", dot: "bg-cyan" },
};

export const STATUS_META: Record<IntegrityStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  ok: { label: "Válido", tone: "ok", icon: <CheckIcon width={12} height={12} /> },
  gap: { label: "Válido · falta un lote previo", tone: "amber", icon: <GapIcon width={12} height={12} /> },
  reordered: { label: "Reordenado", tone: "amber", icon: <SwapIcon width={12} height={12} /> },
  duplicate: { label: "Duplicado", tone: "violet", icon: <CopyIcon width={12} height={12} /> },
  tampered: { label: "Alterado", tone: "bad", icon: <CrossIcon width={12} height={12} /> },
  unknown_key: { label: "Falsificado", tone: "bad", icon: <MaskIcon width={12} height={12} /> },
  broken_chain: { label: "Cadena rota", tone: "bad", icon: <CrossIcon width={12} height={12} /> },
};

export const ATTACK_ICON: Record<AttackKind, ReactNode> = {
  tamper: <PenIcon />,
  duplicate: <CopyIcon />,
  drop: <DropIcon />,
  reorder: <SwapIcon />,
  forge: <MaskIcon />,
};

export const ATTACK_ORDER: AttackKind[] = ["tamper", "duplicate", "drop", "reorder", "forge"];

export function StatusBadge({ status }: { status: IntegrityStatus }) {
  const m = STATUS_META[status];
  const t = TONE[m.tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[0.75rem] font-semibold leading-none ${t.text} ${t.border} ${t.bg}`}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

export const shortHex = (h: string, n = 6) => (h.length > n * 2 + 1 ? `${h.slice(0, n)}…${h.slice(-n)}` : h);
