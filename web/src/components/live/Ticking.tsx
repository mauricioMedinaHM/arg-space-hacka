"use client";
import { useNow } from "@/lib/live/useNow";
import { formatCountdown, relativeTime } from "@/lib/live/time";

/** "hace 4 min", actualizado cada segundo. Antes de montar muestra un guion (sin desajuste de hidratación). */
export function RelativeTime({ ms, className }: { ms: number | null | undefined; className?: string }) {
  const now = useNow();
  const ready = now > 0 && typeof ms === "number" && Number.isFinite(ms);
  return (
    <time className={className} dateTime={ready ? new Date(ms).toISOString() : undefined} suppressHydrationWarning>
      {ready ? relativeTime(ms, now) : "—"}
    </time>
  );
}

/** Cuenta regresiva hasta `to` (ms epoch). */
export function Countdown({ to, className, zero = "00:00" }: { to: number | null | undefined; className?: string; zero?: string }) {
  const now = useNow();
  const ready = now > 0 && typeof to === "number" && Number.isFinite(to);
  const left = ready ? to - now : 0;
  return (
    <span className={`tabular-nums ${className ?? ""}`} role="timer" aria-live="off">
      {!ready ? "—" : left <= 0 ? zero : formatCountdown(left)}
    </span>
  );
}

/** Fracción 0..1 transcurrida de una espera que termina en `to` y dura `totalMs`. */
export function useProgress(to: number | null, totalMs: number): number {
  const now = useNow();
  if (!now || to === null || totalMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - (to - now) / totalMs));
}
