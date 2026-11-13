/** Fuentes verificadas de las cifras de la portada (ver DECISIONS.md, «Intro y estructura»). */
export const SOURCES = {
  cafayate50: {
    label: "El Litoral, jun. 2026",
    href: "https://www.ellitoral.com/sucesos/cafayate-incendios-justicia-salta-bomberos-brigadistas-hectareas-control-bosquenativo-denuncia-fiscalia-investigacion_0_7FbS9j21bE.html",
  },
  cafayate200: {
    label: "La Gaceta, 24/6/2026",
    href: "https://www.lagaceta.com.ar/nota/1142540/sociedad/incendio-cafayate-mas-200-hectareas-afectadas-continuan-operativos-para-evitar-rebrotes.html",
  },
  norte2022: {
    label: "La Nación, 11/11/2022",
    href: "https://www.lanacion.com.ar/sociedad/unas-50000-hectareas-arrasadas-desesperado-combate-de-incendios-en-la-selva-saltena-nid11112022/",
  },
  salta2020: {
    label: "El Litoral, 7/10/2020",
    href: "https://www.ellitoral.com/nacionales/620-intervenciones-incendios-forestales-salta-junio-septiembre_0_n0Kjvg3sCC.html",
  },
  firms: {
    label: "NASA FIRMS, preguntas frecuentes",
    href: "https://www.earthdata.nasa.gov/data/tools/firms/faq",
  },
  fips204: {
    label: "NIST FIPS 204",
    href: "https://csrc.nist.gov/pubs/fips/204/final",
  },
} as const;

export type SourceKey = keyof typeof SOURCES;
