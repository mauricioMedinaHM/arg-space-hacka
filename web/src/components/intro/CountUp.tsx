"use client";
import { animate, useInView } from "motion/react";
import { useEffect, useRef } from "react";
import { useReducedMotionSafe } from "@/components/ui/useReducedMotionSafe";

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/**
 * Contador que sube hasta `value` al entrar en pantalla. El HTML del servidor ya trae la cifra final
 * (se lee sin JavaScript y no hay desajuste de hidratación); la animación sólo reescribe el texto.
 * Con movimiento reducido no se anima.
 */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduce = useReducedMotionSafe();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView || reduce) return;
    const final = nf.format(value);
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = nf.format(Math.round(v));
      },
      onComplete: () => {
        el.textContent = final;
      },
    });
    return () => {
      controls.stop();
      el.textContent = final;
    };
  }, [inView, reduce, value]);

  return (
    <>
      <span ref={ref} aria-hidden className="tabular-nums">
        {nf.format(value)}
      </span>
      <span className="sr-only">{nf.format(value)}</span>
    </>
  );
}
