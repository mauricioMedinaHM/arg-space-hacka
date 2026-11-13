import type { SVGProps } from "react";

/**
 * Estrella de cinco puntas como las del escudo xeneize (forma genérica, sin el escudo).
 * `filled=false` dibuja sólo el contorno (estado pendiente / inactivo).
 */
export function BocaStar({ filled = true, size = 20, className, ...rest }: { filled?: boolean; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <path
        d="M12 1.8l2.95 6.52 7.12.78-5.32 4.8 1.5 7-6.25-3.6-6.25 3.6 1.5-7-5.32-4.8 7.12-.78z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Fila de estrellas decorativa (p.ej. separadores de sección). */
export function StarRow({ count = 5, size = 12, className }: { count?: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-gold ${className ?? ""}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <BocaStar key={i} size={size} />
      ))}
    </span>
  );
}

/** Indicador de carga: estrella que gira y late. Con movimiento reducido queda fija (regla global en globals.css). */
export function StarSpinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span className={`star-spin inline-flex ${className ?? "text-gold"}`} aria-hidden="true">
      <BocaStar size={size} />
    </span>
  );
}
