"use client";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Encabezado de sección: el título se descubre con un recorte; el texto lo sigue. */
export function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="mb-10 md:mb-14">
      <motion.h2
        className="display max-w-[22ch] text-[clamp(1.9rem,4.6vw,3.4rem)]"
        initial={reduce ? false : { clipPath: "inset(0 0 100% 0)", y: 24 }}
        whileInView={{ clipPath: "inset(0 0 -10% 0)", y: 0 }}
        viewport={{ once: true, margin: "-12% 0px" }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        {title}
      </motion.h2>
      {children && (
        <motion.div
          className="prose-measure mt-5 text-[1.0625rem] leading-relaxed text-ash"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-12% 0px" }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}

export function Shell({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`border-t border-line ${className}`}>
      <div className="mx-auto w-full max-w-[1280px] px-4 py-20 sm:px-6 md:py-28 lg:px-10">{children}</div>
    </section>
  );
}
