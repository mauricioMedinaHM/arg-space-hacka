"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { BrandMark } from "@/components/ui/icons";
import { BocaStar } from "@/components/ui/BocaStar";

// Mismo orden que las secciones en page.tsx.
const LINKS = [
  ["#resumen", "Resumen"],
  ["#monitor", "En vivo"],
  ["#como-funciona", "Cómo funciona"],
  ["#demo", "Sandbox"],
  ["#cuantica", "Capa cuántica"],
  ["#rendimiento", "Rendimiento"],
  ["#limites", "Límites"],
] as const;
const LIVE = LINKS[1];

/** Sección que cruza la franja media de la pantalla (para resaltar su enlace). */
function useActiveSection() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const sections = LINKS.map(([href]) => document.getElementById(href.slice(1))).filter((el): el is HTMLElement => !!el);
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        // Si dos secciones tocan la franja, gana la que está más abajo en el documento.
        const current = sections.filter((s) => visible.has(s.id)).pop();
        setActive(current ? `#${current.id}` : null);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);
  return active;
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const active = useActiveSection();

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

  const livePill = (isActive: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md border px-3 font-medium transition-colors hover:bg-gold hover:text-ink ${
      isActive ? "border-gold bg-gold text-ink" : "border-gold/70 text-gold"
    }`;

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
        <a href="#top" className="flex min-h-11 shrink-0 items-center gap-2.5 text-sm font-semibold tracking-tight text-bone">
          <BrandMark />
          <span>
            Custodia PQ <span className="font-normal text-smoke">/ Salta</span>
          </span>
        </a>

        {/* Escritorio: todos los enlaces en línea. */}
        <ul className="hidden items-center gap-0.5 text-[0.8125rem] lg:flex xl:gap-1 xl:text-sm">
          {LINKS.map(([href, label]) => {
            const isActive = active === href;
            return (
              <li key={href}>
                <a
                  href={href}
                  aria-current={isActive ? "location" : undefined}
                  className={
                    href === LIVE[0]
                      ? `mx-1.5 min-h-9 ${livePill(isActive)}`
                      : `relative inline-flex min-h-9 items-center rounded-md px-2.5 transition-colors hover:text-bone xl:px-3 ${
                          isActive ? "font-medium text-gold" : "text-ash"
                        }`
                  }
                >
                  {href === LIVE[0] && <BocaStar size={11} />}
                  {label}
                  {isActive && href !== LIVE[0] && (
                    <motion.span
                      layoutId="nav-activo"
                      aria-hidden
                      className="absolute inset-x-2.5 -bottom-[0.6875rem] h-0.5 rounded-full bg-gold xl:inset-x-3"
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                </a>
              </li>
            );
          })}
        </ul>

        {/* Móvil y tablet: acceso directo al monitor + menú desplegable con todas las secciones. */}
        <div className="flex items-center gap-2 lg:hidden">
          <a href={LIVE[0]} className={`min-h-11 text-sm ${livePill(active === LIVE[0])}`}>
            <BocaStar size={11} />
            {LIVE[1]}
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
            className="overflow-hidden border-t border-line bg-ink lg:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <ul className="px-4 py-2 sm:px-6" aria-label="Secciones">
              {LINKS.map(([href, label]) => {
                const isActive = active === href;
                return (
                  <li key={href} className="border-b border-line last:border-b-0">
                    <a
                      href={href}
                      aria-current={isActive ? "location" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-12 items-center gap-2.5 text-[0.9375rem] font-medium transition-colors hover:text-gold ${
                        isActive ? "text-gold" : "text-bone"
                      }`}
                    >
                      <BocaStar size={12} filled={isActive} className={isActive ? "text-gold" : "text-line-strong"} />
                      {label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
