"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { BrandMark } from "@/components/ui/icons";

const LINKS = [
  ["#monitor", "En vivo"],
  ["#demo", "Sandbox"],
  ["#como-funciona", "Cómo funciona"],
  ["#cuantica", "Capa cuántica"],
  ["#rendimiento", "Rendimiento"],
  ["#limites", "Límites"],
] as const;

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggle = useRef<HTMLButtonElement>(null);

  // Escape cierra el menú móvil y devuelve el foco al botón.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-md">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-bone focus:px-3 focus:py-2 focus:text-ink"
      >
        Saltar al contenido
      </a>
      <nav
        aria-label="Secciones"
        className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10"
      >
        <a href="#top" className="flex min-h-11 items-center gap-2.5 text-sm font-semibold tracking-tight text-bone">
          <BrandMark />
          <span>
            Custodia PQ <span className="font-normal text-smoke">/ Salta</span>
          </span>
        </a>

        {/* Escritorio: todos los enlaces en línea. */}
        <ul className="hidden items-center gap-1 text-sm md:flex">
          {LINKS.map(([href, label], i) => (
            <li key={href}>
              <a
                href={href}
                className={
                  i === 0
                    ? "mr-2 inline-flex min-h-9 items-center rounded-md border border-fire/70 px-3 font-medium text-fire transition-colors hover:bg-fire hover:text-ink"
                    : "inline-flex min-h-9 items-center rounded-md px-3 text-ash transition-colors hover:text-bone"
                }
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        {/* Móvil: acceso directo al monitor + menú desplegable con el resto. */}
        <div className="flex items-center gap-2 md:hidden">
          <a
            href={LINKS[0][0]}
            className="inline-flex min-h-11 items-center rounded-md border border-fire/70 px-3 text-sm font-medium text-fire transition-colors hover:bg-fire hover:text-ink"
          >
            {LINKS[0][1]}
          </a>
          <button
            ref={toggle}
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line-strong text-bone transition-colors hover:bg-char"
          >
            <span className="sr-only">{open ? "Cerrar menú de secciones" : "Abrir menú de secciones"}</span>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              {open ? <path d="m4 4 10 10M14 4 4 14" /> : <path d="M3 5h12M3 9h12M3 13h12" />}
            </svg>
          </button>
        </div>
      </nav>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={menuId}
            key="menu"
            className="overflow-hidden border-t border-line bg-ink md:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <ul className="px-4 py-2 sm:px-6" aria-label="Secciones">
              {LINKS.map(([href, label]) => (
                <li key={href} className="border-b border-line last:border-b-0">
                  <a
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center text-[0.9375rem] font-medium text-bone transition-colors hover:text-fire"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
