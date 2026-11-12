import { BrandMark } from "@/components/ui/icons";

const LINKS = [
  ["#demo", "Demo"],
  ["#como-funciona", "Cómo funciona"],
  ["#cuantica", "Capa cuántica"],
  ["#rendimiento", "Rendimiento"],
  ["#limites", "Límites"],
] as const;

export function SiteNav() {
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
        className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10"
      >
        <a href="#top" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-bone">
          <BrandMark />
          <span>
            Custodia PQ <span className="font-normal text-smoke">/ Salta</span>
          </span>
        </a>
        <ul className="flex items-center gap-1 text-sm">
          {LINKS.map(([href, label], i) => (
            <li key={href} className={i === 0 ? "" : "hidden md:block"}>
              <a
                href={href}
                className={
                  i === 0
                    ? "inline-flex min-h-9 items-center rounded-md border border-fire/70 px-3 font-medium text-fire transition-colors hover:bg-fire hover:text-ink md:mr-2"
                    : "inline-flex min-h-9 items-center rounded-md px-3 text-ash transition-colors hover:text-bone"
                }
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
