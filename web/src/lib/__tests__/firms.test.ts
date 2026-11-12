import { describe, expect, it } from "vitest";
import { SALTA_BBOX, inSalta, mapConfidence, parseFirmsCsv, toBatches } from "../firms";
import { loadHistorical } from "../firms-historical";

const VIIRS_API = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
-26.07012,-65.97034,341.2,0.41,0.45,2026-06-14,1742,N,VIIRS,n,2.0NRT,295.1,12.4,D
-24.78,-65.41,367,0.39,0.36,2026-06-14,523,N,VIIRS,h,2.0NRT,290.3,45.9,N
-34.6,-58.38,330.5,0.5,0.4,2026-06-14,1742,N,VIIRS,l,2.0NRT,292,3.1,D
`;

// CSV público: sin columna instrument, confianza en palabras
const VIIRS_PUBLIC = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight\r
-23.1,-64.3,303.77,0.76,0.77,2026-11-05,0336,N20,nominal,2.0NRT,289.79,3.37,N\r
-22.5,-63.8,333.1,0.4,0.6,2026-11-05,1712,N21,low,2.0NRT,300.2,5.5,D\r
-25.1,-64.1,360.0,0.4,0.6,2026-11-05,1712,N21,high,2.0NRT,300.2,30.5,D\r
`;

const MODIS = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-25.5,-64.9,320.4,1.1,1.0,2026-06-13,1445,Terra,MODIS,85,6.1NRT,298.7,22.3,D
-25.6,-64.8,310.1,1.2,1.1,2026-06-13,1810,A,MODIS,45,6.1NRT,295.0,9.9,D
-25.7,-64.7,305.0,1.2,1.1,2026-06-13,1810,Aqua,MODIS,10,6.1NRT,294.0,4.0,D
`;

describe("parseFirmsCsv", () => {
  it("parsea VIIRS del área API", () => {
    const d = parseFirmsCsv(VIIRS_API);
    expect(d).toHaveLength(3);
    expect(d[0]).toEqual({
      id: "N-2026-06-14-1742--26.07012--65.97034",
      latitude: -26.07012,
      longitude: -65.97034,
      bright_ti4: 341.2,
      bright_ti5: 295.1,
      frp: 12.4,
      scan: 0.41,
      track: 0.45,
      acq_date: "2026-06-14",
      acq_time: "1742",
      satellite: "N",
      instrument: "VIIRS",
      confidence: "n",
      daynight: "D",
      source: "firms-live",
    });
    expect(d[1].acq_time).toBe("0523"); // rellena con ceros
    expect(d[1].daynight).toBe("N");
    expect(d[1].confidence).toBe("h");
  });

  it("parsea el CSV público sin columna instrument y confianza en palabras", () => {
    const d = parseFirmsCsv(VIIRS_PUBLIC, "historical");
    expect(d.map((x) => x.satellite)).toEqual(["N20", "N21", "N21"]);
    expect(d.map((x) => x.confidence)).toEqual(["n", "l", "h"]);
    expect(d.every((x) => x.instrument === "VIIRS" && x.source === "historical")).toBe(true);
    expect(d[0].bright_ti5).toBe(289.79);
  });

  it("mapea la variante MODIS (brightness/bright_t31, confianza numérica)", () => {
    const d = parseFirmsCsv(MODIS);
    expect(d).toHaveLength(3);
    expect(d[0]).toMatchObject({
      satellite: "Terra",
      instrument: "MODIS",
      bright_ti4: 320.4,
      bright_ti5: 298.7,
      confidence: "h",
    });
    expect(d[1]).toMatchObject({ satellite: "Aqua", confidence: "n" });
    expect(d[2].confidence).toBe("l");
  });

  it("no lanza con entradas vacías, de error o filas corruptas", () => {
    expect(parseFirmsCsv("")).toEqual([]);
    expect(parseFirmsCsv("Invalid MAP_KEY.")).toEqual([]);
    expect(parseFirmsCsv(VIIRS_API.split("\n")[0])).toEqual([]);
    const broken = VIIRS_API + "foo,bar\n,,,,\n-25,abc,1,1,1,2026-06-14,1200,N,VIIRS,n,2,1,1,D\n";
    expect(parseFirmsCsv(broken)).toHaveLength(3);
  });

  it("genera ids únicos y estables", () => {
    const a = parseFirmsCsv(VIIRS_API);
    const b = parseFirmsCsv(VIIRS_API);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
  });
});

describe("mapConfidence", () => {
  it("umbral MODIS 30/80", () => {
    expect(["0", "29", "30", "79", "80", "100"].map(mapConfidence)).toEqual(["l", "l", "n", "n", "h", "h"]);
    expect(mapConfidence("")).toBe("n");
  });
});

describe("inSalta / SALTA_BBOX", () => {
  it("filtra por bbox", () => {
    const d = parseFirmsCsv(VIIRS_API).filter(inSalta);
    expect(d).toHaveLength(2); // Buenos Aires queda afuera
    expect(inSalta({ latitude: -26.07, longitude: -65.97 })).toBe(true); // Cafayate
    expect(inSalta({ latitude: -24.79, longitude: -65.41 })).toBe(true); // Salta capital
    expect(inSalta({ latitude: -31.42, longitude: -64.18 })).toBe(false); // Córdoba
    expect(inSalta({ latitude: -24.0, longitude: -60.0 })).toBe(false);
  });
  it("los bordes son inclusivos", () => {
    expect(inSalta({ latitude: SALTA_BBOX.south, longitude: SALTA_BBOX.west })).toBe(true);
    expect(inSalta({ latitude: SALTA_BBOX.north, longitude: SALTA_BBOX.east })).toBe(true);
    expect(inSalta({ latitude: SALTA_BBOX.north + 0.001, longitude: SALTA_BBOX.east })).toBe(false);
  });
});

describe("loadHistorical", () => {
  const all = loadHistorical();
  it("cumple el contrato FireDetection", () => {
    expect(all.length).toBeGreaterThanOrEqual(300);
    expect(all.length).toBeLessThanOrEqual(600);
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    for (const d of all) {
      expect(inSalta(d)).toBe(true);
      expect(d.acq_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.acq_time).toMatch(/^\d{4}$/);
      expect(["N", "N20", "N21", "Terra", "Aqua"]).toContain(d.satellite);
      expect(["l", "n", "h"]).toContain(d.confidence);
      expect(["D", "N"]).toContain(d.daynight);
      expect(["historical", "synthetic"]).toContain(d.source);
      expect(d.id).toBe(`${d.satellite}-${d.acq_date}-${d.acq_time}-${d.latitude}-${d.longitude}`);
    }
  });
  it("está ordenado cronológicamente", () => {
    const keys = all.map((d) => d.acq_date + d.acq_time);
    expect(keys).toEqual([...keys].sort());
  });
  it("incluye el escenario sintético de Cafayate (jun-2026)", () => {
    const caf = all.filter(
      (d) => d.source === "synthetic" && Math.abs(d.latitude + 26.07) < 0.05 && Math.abs(d.longitude + 65.97) < 0.05,
    );
    expect(caf.length).toBeGreaterThan(50);
    for (const d of caf) {
      expect(d.acq_date >= "2026-06-12" && d.acq_date <= "2026-06-16").toBe(true);
      expect(d.bright_ti4).toBeGreaterThanOrEqual(300);
      expect(d.bright_ti4).toBeLessThanOrEqual(367);
      expect(d.frp).toBeGreaterThanOrEqual(1);
      expect(d.frp).toBeLessThanOrEqual(60);
    }
  });
});

describe("toBatches", () => {
  it("parte en lotes conservando orden y total", () => {
    const dets = loadHistorical().slice(0, 25);
    const b = toBatches(dets, 10);
    expect(b.map((x) => x.length)).toEqual([10, 10, 5]);
    expect(b.flat()).toEqual(dets);
    expect(toBatches([], 10)).toEqual([]);
    expect(toBatches(dets, 0)).toHaveLength(25); // tamaño inválido → 1
  });
});
