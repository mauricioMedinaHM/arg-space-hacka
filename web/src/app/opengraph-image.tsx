import { ImageResponse } from "next/og";

// Imagen Open Graph / Twitter generada en el build (estática). Sólo flexbox: lo que soporta Satori.
export const alt = "Cadena de custodia post-cuántica para focos de incendio en Salta: lotes NASA FIRMS firmados con ML-DSA-65";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0b0a09";
const BONE = "#f3eee6";
const ASH = "#b9b1a5";
const FIRE = "#ff6a1f";
const CYAN = "#45d9e3";
const OK = "#4bd58f";
const BAD = "#ff5263";
const LINE = "#4a433c";

const BLOCKS = [
  { seq: 41, ok: true },
  { seq: 42, ok: true },
  { seq: 43, ok: false },
  { seq: 44, ok: true },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: INK,
          backgroundImage: "radial-gradient(ellipse 70% 60% at 25% 100%, rgba(255,106,31,0.30), rgba(11,10,9,0) 70%)",
          color: BONE,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, color: ASH }}>
          <svg width="44" height="44" viewBox="0 0 32 32" style={{ marginRight: 16 }}>
            <path d="M16 3.5 26.8 9.75v12.5L16 28.5 5.2 22.25V9.75Z" fill="none" stroke={CYAN} strokeWidth="1.6" />
            <path
              d="M16.4 8.5c.6 3.4 4.6 5.2 4.6 9.4a5 5 0 0 1-10 0c0-2 .9-3.3 2-4.4.3 1.5 1 2.3 1.9 2.6-.5-3 .3-5.7 1.5-7.6Z"
              fill={FIRE}
            />
          </svg>
          <span style={{ color: BONE, fontWeight: 700 }}>Custodia PQ</span>
          <span style={{ marginLeft: 12 }}>/ Salta</span>
          <span style={{ marginLeft: "auto", fontSize: 24 }}>ARG Space Hackathon</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            <span>Cadena de custodia&nbsp;</span>
            <span style={{ color: CYAN }}>post-cuántica&nbsp;</span>
            <span>para focos de incendio en&nbsp;</span>
            <span style={{ color: FIRE }}>Salta</span>
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 30, color: ASH, lineHeight: 1.3 }}>
            Focos NASA FIRMS firmados lote por lote con ML-DSA-65 (FIPS 204) y verificados en el navegador.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          {BLOCKS.map((b, i) => (
            <div key={b.seq} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && <div style={{ width: 36, height: 2, backgroundColor: LINE }} />}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "14px 20px",
                  border: `2px solid ${b.ok ? LINE : BAD}`,
                  borderRadius: 8,
                  backgroundColor: "#131110",
                  width: 232,
                }}
              >
                <span style={{ fontSize: 24, fontWeight: 700 }}>lote #{b.seq}</span>
                <span style={{ fontSize: 20, marginTop: 4, color: b.ok ? OK : BAD }}>
                  {b.ok ? "Firma válida" : "Alterado"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
