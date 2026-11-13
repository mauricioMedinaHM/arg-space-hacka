import { ImageResponse } from "next/og";

// Imagen Open Graph / Twitter generada en el build (estática). Sólo flexbox: lo que soporta Satori.
export const alt = "Cadena de custodia post-cuántica para focos de incendio en Salta: lotes NASA FIRMS firmados con ML-DSA-65";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#050b18";
const NAVY = "#00235a";
const BOCA = "#003a8c";
const COAL = "#0a1428";
const BONE = "#f2f5fb";
const ASH = "#b4c0d6";
const GOLD = "#f8bc26";
const AZUL = "#9cc0ff";
const OK = "#45d48c";
const BAD = "#ff6170";
const LINE = "#34497a";
const STAR = "M12 1.8l2.95 6.52 7.12.78-5.32 4.8 1.5 7-6.25-3.6-6.25 3.6 1.5-7-5.32-4.8 7.12-.78z";

function Star({ size, color = GOLD, style }: { size: number; color?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <path d={STAR} fill={color} />
    </svg>
  );
}

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
          backgroundImage: `linear-gradient(160deg, ${NAVY} 0%, ${INK} 62%)`,
          borderTop: `14px solid ${GOLD}`,
          color: BONE,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, color: ASH }}>
          <Star size={44} style={{ marginRight: 16 }} />
          <span style={{ color: BONE, fontWeight: 700 }}>Custodia PQ</span>
          <span style={{ marginLeft: 12 }}>/ Salta</span>
          <div style={{ display: "flex", alignItems: "center", marginLeft: "auto", fontSize: 24 }}>
            <Star size={18} style={{ marginRight: 8 }} />
            <Star size={18} style={{ marginRight: 8 }} />
            <Star size={18} style={{ marginRight: 16 }} />
            <span>ARG Space Hackathon</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            <span>Cadena de custodia&nbsp;</span>
            <span style={{ color: GOLD }}>post-cuántica&nbsp;</span>
            <span>para focos de incendio en&nbsp;</span>
            <span style={{ color: AZUL }}>Salta</span>
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
                  border: `2px solid ${b.ok ? BOCA : BAD}`,
                  borderRadius: 8,
                  backgroundColor: COAL,
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
