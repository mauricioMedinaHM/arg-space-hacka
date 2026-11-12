// Snapshot congelado de focos (FIRMS real "historical" + escenario "synthetic").
// Separado de `./firms` para que el JSON (~161 KB) no entre al bundle inicial del cliente:
// en el navegador cargarlo con `const { loadHistorical } = await import("@/lib/firms-historical")`.
import type { FireDetection } from "./types";
import historical from "../data/firms-salta.json";

/** Snapshot ya ordenado cronológicamente. */
export function loadHistorical(): FireDetection[] {
  return historical as unknown as FireDetection[];
}
