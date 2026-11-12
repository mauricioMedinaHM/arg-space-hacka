"use client";
import { motion } from "motion/react";
import { useId } from "react";

export interface SegOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

/** Selector segmentado (radiogroup) con indicador animado por layout. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  tone = "bone",
}: {
  label: string;
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  tone?: "bone" | "fire";
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap rounded-md border border-line bg-ink p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`relative min-h-9 rounded-[5px] px-3 text-[0.8125rem] font-medium transition-colors duration-200 ${
              active ? "text-ink" : "text-ash hover:text-bone"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                className={`absolute inset-0 rounded-[5px] ${tone === "fire" ? "bg-fire" : "bg-bone"}`}
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative whitespace-nowrap">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
