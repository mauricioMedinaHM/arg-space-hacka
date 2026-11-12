import { describe, it, expect } from "vitest";
import { DemoEngine } from "../demo/engine";
import { generateKeyPair } from "../pipeline";
import { loadHistorical } from "../firms";

const kp = generateKeyPair(new Uint8Array(32).fill(9));
const dets = loadHistorical().slice(0, 120);

function fresh() {
  const e = new DemoEngine();
  e.setKey(kp, "qrng");
  e.setBatchSize(10);
  e.load(dets);
  return e;
}
const drain = (e: DemoEngine) => {
  for (let i = 0; i < 100 && !e.getSnapshot().done; i++) e.step();
  return e.getSnapshot();
};
const statuses = (e: DemoEngine) =>
  e.getSnapshot().log.flatMap((l) => (l.kind === "result" ? [`${l.result.seq}:${l.result.status}`] : [])).reverse();

describe("DemoEngine", () => {
  it("flujo limpio: todo válido y sin huecos", () => {
    const s = drain(fresh());
    expect(s.totalBatches).toBe(12);
    expect(s.metrics).toMatchObject({ received: 12, valid: 12, tampered: 0, duplicate: 0, lost: 0, reordered: 0, forged: 0 });
    expect(s.points.length).toBe(120);
  });

  it("retiene lotes en tránsito y arma ataques antes de empezar", () => {
    const e = fresh();
    e.inject("tamper");
    expect(e.getSnapshot().armed).toEqual(["tamper"]);
    e.step();
    expect(e.getSnapshot().armed).toEqual([]);
    expect(e.getSnapshot().queue[0].mark).toBe("tamper");
    const s = drain(e);
    expect(statuses(e).slice(0, 2)).toEqual(["0:tampered", "1:gap"]);
    expect(s.metrics).toMatchObject({ tampered: 1, lost: 1, valid: 11 });
    expect(s.points.filter((p) => p.status === "bad").length).toBe(10);
  });

  it("detecta duplicado, supresión, reordenamiento y falsificación", () => {
    const e = fresh();
    e.step(); // #0 en tránsito
    e.inject("duplicate");
    e.step();
    e.step(); // entrega #0
    e.step(); // entrega copia de #0
    e.inject("drop"); // suprime el próximo lote en tránsito (#2)
    e.step();
    e.inject("reorder");
    e.step();
    e.step();
    e.inject("forge");
    const s = drain(e);
    const st = statuses(e);
    expect(st).toContain("0:duplicate");
    expect(st).toContain("4:gap");
    expect(st.some((x) => x.endsWith(":reordered"))).toBe(true);
    expect(st.some((x) => x.endsWith(":unknown_key"))).toBe(true);
    expect(s.metrics.duplicate).toBe(1);
    expect(s.metrics.forged).toBe(1);
    expect(s.metrics.reordered).toBe(1);
    expect(s.missing).toEqual([2]);
    expect(s.metrics.received).toBe(s.metrics.valid + s.metrics.tampered + s.metrics.duplicate + s.metrics.forged);
  });

  it("reiniciar y cambiar el tamaño de lote limpian el estado", () => {
    const e = fresh();
    drain(e);
    e.setBatchSize(20);
    const s = e.getSnapshot();
    expect(s.totalBatches).toBe(6);
    expect(s.signed).toBe(0);
    expect(s.log.length).toBe(0);
    expect(s.done).toBe(false);
  });
});
