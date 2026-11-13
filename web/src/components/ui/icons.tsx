import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (props: P): P => ({
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  ...props,
});

export const PlayIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 2.8v10.4L13 8Z" fill="currentColor" />
  </svg>
);
export const PauseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 3v10M11 3v10" strokeWidth={2.2} />
  </svg>
);
export const StepIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 3.2v9.6L10 8Z" fill="currentColor" />
    <path d="M12.5 3v10" />
  </svg>
);
export const ResetIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.75" />
    <path d="M2.5 2.5v2.9h2.9" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m3 8.5 3.2 3.2L13 4.8" />
  </svg>
);
export const CrossIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </svg>
);
export const GapIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 8h3M11 8h3" />
    <path d="M7 8h.01M9 8h.01" strokeWidth={2} />
  </svg>
);
export const SwapIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13" />
  </svg>
);
export const CopyIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
    <path d="M10.5 5.5V3.7a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8" />
  </svg>
);
export const PenIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m3 13 .6-2.9 7.2-7.2a1.3 1.3 0 0 1 1.9 0l.4.4a1.3 1.3 0 0 1 0 1.9L5.9 12.4Z" />
  </svg>
);
export const DropIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
  </svg>
);
export const MaskIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 4.5c3.5-1.3 7.5-1.3 11 0 0 4.5-2 7.5-5.5 8.5-3.5-1-5.5-4-5.5-8.5Z" />
    <path d="M5.5 7.5h1.5M9 7.5h1.5" />
  </svg>
);
export const ArrowDownIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" />
  </svg>
);
export const ExternalIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6.5 3.5H3.5v9h9v-3M9.5 3h3.5v3.5M13 3 7.5 8.5" />
  </svg>
);
export const ChevronIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 6 4 4 4-4" />
  </svg>
);
/** Marca: estrella dorada dentro de un hexágono azul (forma genérica). */
export const BrandMark = (p: P) => (
  <svg {...base({ width: 22, height: 22, viewBox: "0 0 32 32", strokeWidth: 1.6, ...p })}>
    <path d="M16 3.5 26.8 9.75v12.5L16 28.5 5.2 22.25V9.75Z" stroke="var(--color-azul)" fill="var(--color-boca-deep)" />
    <path
      transform="translate(7.6 7.4) scale(0.7)"
      d="M12 1.8l2.95 6.52 7.12.78-5.32 4.8 1.5 7-6.25-3.6-6.25 3.6 1.5-7-5.32-4.8 7.12-.78z"
      fill="var(--color-gold)"
      stroke="none"
    />
  </svg>
);
