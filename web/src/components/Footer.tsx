import { BocaStar, StarRow } from "@/components/ui/BocaStar";
import { BrandMark, ExternalIcon } from "@/components/ui/icons";

const SOURCES = [
  ["La Gaceta", "Incendio en Cafayate: más de 200 ha afectadas (jun. 2026)", "https://www.lagaceta.com.ar/nota/1142540/sociedad/incendio-cafayate-mas-200-hectareas-afectadas-continuan-operativos-para-evitar-rebrotes.html"],
  ["Canal 26", "Daño ambiental del incendio forestal en Cafayate (19/06/2026)", "https://www.canal26.com/planeta/2026/06/19/incendio-forestal-en-cafayate-ya-son-mas-de-200-hectareas-afectadas-y-afirman-que-el-dano-ambiental-es-considerable/"],
  ["El Litoral", "Cafayate: más de 50 ha de bosque nativo en la primera etapa (jun. 2026)", "https://www.ellitoral.com/sucesos/cafayate-incendios-justicia-salta-bomberos-brigadistas-hectareas-control-bosquenativo-denuncia-fiscalia-investigacion_0_7FbS9j21bE.html"],
  ["La Nación", "Unas 50.000 ha arrasadas en la selva salteña (11/11/2022)", "https://www.lanacion.com.ar/sociedad/unas-50000-hectareas-arrasadas-desesperado-combate-de-incendios-en-la-selva-saltena-nid11112022/"],
  ["NIST FIPS 204", "Estándar ML-DSA (firma digital basada en retículos)", "https://csrc.nist.gov/pubs/fips/204/final"],
  ["NASA FIRMS", "Focos activos VIIRS y MODIS en tiempo casi real", "https://firms.modaps.eosdis.nasa.gov/"],
  ["FIRMS: preguntas frecuentes", "Limitaciones de la detección satelital", "https://www.earthdata.nasa.gov/data/tools/firms/faq"],
  ["Qiskit", "SDK cuántico usado para las simulaciones con Aer", "https://www.ibm.com/quantum/qiskit"],
] as const;

export function Footer() {
  return (
    <footer className="band-boca border-t border-boca">
      <div className="mx-auto grid w-full max-w-[1280px] gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] lg:gap-16 lg:px-10">
        <div>
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <BrandMark /> Custodia PQ <span className="font-normal text-smoke">/ Salta</span>
          </div>
          <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-ash">
            Integridad post-cuántica para datos de incendios en Salta. Proyecto hecho para el ARG Space Hackathon.
          </p>
          <p className="mt-4 max-w-[38ch] text-[0.8125rem] leading-relaxed text-smoke">
            Mapa base: OpenFreeMap © OpenMapTiles, datos © OpenStreetMap. Reconocemos el uso de datos de NASA FIRMS (LANCE / EOSDIS).
          </p>
        </div>
        <div>
          <h2 className="flex items-center gap-3 text-sm font-semibold text-bone">Fuentes <StarRow count={3} size={9} /></h2>
          <ul className="mt-4 border-t border-line">
            {SOURCES.map(([name, desc, href]) => (
              <li key={href} className="border-b border-line">
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="group grid gap-x-6 gap-y-0.5 py-3.5 transition-colors sm:grid-cols-[14rem_minmax(0,1fr)_minmax(0,20rem)] sm:items-baseline"
                >
                  <span className="flex items-baseline gap-2.5 font-medium text-bone group-hover:text-gold">
                    <BocaStar size={10} className="shrink-0 translate-y-px text-gold" />
                    {name}
                  </span>
                  <span className="text-sm text-ash">{desc}</span>
                  <span className="inline-flex items-center gap-1.5 break-all font-mono text-xs text-smoke group-hover:text-bone sm:justify-end sm:text-right">
                    {href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} <ExternalIcon width={12} height={12} />
                    <span className="sr-only">(se abre en una pestaña nueva)</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
