import { ExternalIcon } from "@/components/ui/icons";
import { SOURCES, type SourceKey } from "./sources";

/** Enlace a la fuente de una cifra. Se abre en pestaña nueva y lo avisa a lectores de pantalla. */
export function SourceLink({ source, className = "" }: { source: SourceKey; className?: string }) {
  const s = SOURCES[source];
  return (
    <a
      href={s.href}
      target="_blank"
      rel="noreferrer"
      className={`underline decoration-line-strong underline-offset-4 transition-colors hover:text-bone hover:decoration-gold ${className}`}
    >
      {s.label}
      <ExternalIcon width={11} height={11} className="ml-1 inline-block align-baseline" />
      <span className="sr-only">(se abre en una pestaña nueva)</span>
    </a>
  );
}
