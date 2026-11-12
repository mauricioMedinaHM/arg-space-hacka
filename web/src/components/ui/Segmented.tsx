"use client";
import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent } from "react";

export interface SegOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Selector segmentado (radiogroup) con indicador animado por layout.
 * Teclado según el patrón ARIA de radiogroup: un solo tope de tabulación (la opción activa) y
 * flechas / Inicio / Fin para moverse y seleccionar.
 */
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
  const group = useRef<HTMLDivElement>(null);
  const hasActive = options.some((o) => o.value === value);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const cur = options.findIndex((o) => o.value === value);
    let next: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (cur + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (cur - 1 + options.length) % options.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = options.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(options[next].value);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex max-w-full flex-wrap rounded-md border border-line bg-ink p-0.5"
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (!hasActive && i === 0) ? 0 : -1}
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
