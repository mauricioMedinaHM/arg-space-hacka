"use client";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Respeta prefers-reduced-motion en todas las animaciones de motion. */
export function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
