// Motor de la demo: recolector → red (ataques) → verificador. Sin React; se consume con useSyncExternalStore.
import type { AttackKind, FireDetection, IntegrityStatus, SignedBatch, VerificationResult } from "../types";
import { Collector, Verifier, applyAttack, forgeBatch, type KeyPair } from "../pipeline";
import { toBatches } from "../firms";

export type PointStatus = "ok" | "bad" | "reordered";

export interface MapPoint {
  key: string;
  lng: number;
  lat: number;
  frp: number;
  status: PointStatus;
  fresh: boolean;
}

export interface QueueItem {
  uid: number;
  batch: SignedBatch;
  mark?: AttackKind;
}

export type LogEntry =
  | { uid: number; kind: "result"; batch: SignedBatch; result: VerificationResult; mark?: AttackKind }
  | { uid: number; kind: "event"; attack: AttackKind; text: string };

export interface Metrics {
  received: number;
  valid: number;
  tampered: number;
  duplicate: number;
  lost: number;
  reordered: number;
  forged: number;
  avgVerifyMs: number;
  avgSignMs: number;
}

export type KeyOrigin = "qrng" | "random";

export interface DemoSnapshot {
  ready: boolean;
  playing: boolean;
  done: boolean;
  speed: number;
  batchSize: number;
  totalBatches: number;
  totalDetections: number;
  signed: number;
  queue: QueueItem[];
  armed: AttackKind[];
  log: LogEntry[];
  points: MapPoint[];
  metrics: Metrics;
  missing: number[];
  keyId: string | null;
  keyOrigin: KeyOrigin | null;
}

/** Lotes que la "red" retiene en vuelo para que se puedan atacar antes de entregarse. */
const HOLD = 2;
const BASE_INTERVAL_MS = 1100;
const LOG_CAP = 120;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const ZERO: Metrics = {
  received: 0,
  valid: 0,
  tampered: 0,
  duplicate: 0,
  lost: 0,
  reordered: 0,
  forged: 0,
  avgVerifyMs: 0,
  avgSignMs: 0,
};

function pointStatusOf(status: IntegrityStatus): PointStatus | null {
  switch (status) {
    case "ok":
    case "gap":
    case "broken_chain":
      return "ok";
    case "reordered":
      return "reordered";
    case "tampered":
    case "unknown_key":
      return "bad";
    case "duplicate":
      return null;
  }
}

export class DemoEngine {
  private listeners = new Set<() => void>();
  private kp: KeyPair | null = null;
  private keyOrigin: KeyOrigin | null = null;
  private collector: Collector | null = null;
  private verifier: Verifier | null = null;
  private detections: FireDetection[] = [];
  private source: FireDetection[][] = [];
  private cursor = 0;
  private queue: QueueItem[] = [];
  private armed: AttackKind[] = [];
  private log: LogEntry[] = [];
  private points: MapPoint[] = [];
  private counts = { ...ZERO };
  private signMs = 0;
  private verifyMs = 0;
  private uid = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private playing = false;
  private done = false;
  private speed = 1;
  private batchSize = 5;
  private snap: DemoSnapshot = this.build();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  setKey(kp: KeyPair, origin: KeyOrigin) {
    this.kp = kp;
    this.keyOrigin = origin;
    this.rebuild();
  }

  load(detections: FireDetection[]) {
    this.detections = detections;
    this.rebuild();
  }

  setBatchSize(n: number) {
    if (n === this.batchSize) return;
    this.batchSize = n;
    this.rebuild();
  }

  setSpeed(s: number) {
    this.speed = s;
    if (this.playing) this.schedule();
    this.emit();
  }

  play() {
    if (!this.collector || this.playing) return;
    if (this.done) this.rebuild();
    this.playing = true;
    this.tick();
    if (this.playing) this.schedule();
  }

  pause() {
    this.playing = false;
    this.clearTimer();
    this.emit();
  }

  step() {
    if (!this.collector || this.done) return;
    this.pause();
    this.tick();
  }

  reset() {
    this.rebuild();
  }

  inject(kind: AttackKind) {
    if (!this.collector || this.done) return;
    this.armed.push(kind);
    this.applyArmed();
    this.emit();
  }

  dispose() {
    this.clearTimer();
    this.playing = false;
  }

  private rebuild() {
    this.clearTimer();
    this.playing = false;
    this.done = false;
    this.cursor = 0;
    this.queue = [];
    this.armed = [];
    this.log = [];
    this.points = [];
    this.counts = { ...ZERO };
    this.signMs = 0;
    this.verifyMs = 0;
    this.source = toBatches(this.detections, this.batchSize);
    if (this.kp) {
      this.collector = new Collector({ keyPair: this.kp });
      this.verifier = new Verifier([this.kp.publicKey]);
    }
    this.emit();
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.playing) return;
      this.tick();
      if (this.playing) this.schedule();
    }, BASE_INTERVAL_MS / this.speed);
  }

  private exhausted() {
    return this.cursor >= this.source.length;
  }

  private tick() {
    if (!this.collector || !this.verifier) return;
    if (!this.exhausted()) {
      const t = now();
      const batch = this.collector.makeBatch(this.source[this.cursor]);
      this.signMs += now() - t;
      this.cursor += 1;
      this.queue.push({ uid: ++this.uid, batch });
    }
    this.applyArmed();
    if (this.queue.length > HOLD || (this.exhausted() && this.queue.length > 0)) {
      this.deliver(this.queue.shift()!);
    }
    if (this.exhausted() && this.queue.length === 0) {
      this.playing = false;
      this.done = true;
      this.armed = [];
      this.clearTimer();
    }
    this.emit();
  }

  private event(attack: AttackKind, text: string) {
    this.pushLog({ uid: ++this.uid, kind: "event", attack, text });
  }

  private pushLog(entry: LogEntry) {
    this.log = [entry, ...this.log].slice(0, LOG_CAP);
  }

  /** Aplica los ataques armados sobre el próximo lote a entregar (cabeza de la cola). */
  private applyArmed() {
    const pending: AttackKind[] = [];
    for (const kind of this.armed) {
      const head = this.queue[0];
      if (!head || (kind === "reorder" && this.queue.length < 2)) {
        if (!this.exhausted()) pending.push(kind);
        continue;
      }
      const seq = head.batch.payload.seq;
      switch (kind) {
        case "tamper":
          head.batch = applyAttack([head.batch], "tamper", 0)[0];
          head.mark = "tamper";
          this.event(kind, `Lote #${seq}: se modificó el FRP y la posición de un foco en tránsito.`);
          break;
        case "duplicate": {
          const copy = applyAttack([head.batch], "duplicate", 0)[1];
          this.queue.splice(1, 0, { uid: ++this.uid, batch: copy, mark: "duplicate" });
          this.event(kind, `Lote #${seq}: se reinyectó una copia idéntica (replay).`);
          break;
        }
        case "drop":
          this.queue.shift();
          this.event(kind, `Lote #${seq}: eliminado del flujo antes de llegar al verificador.`);
          break;
        case "reorder": {
          const next = this.queue[1];
          this.queue[0] = next;
          this.queue[1] = head;
          next.mark = next.mark ?? "reorder";
          head.mark = head.mark ?? "reorder";
          this.event(kind, `Lotes #${seq} y #${next.batch.payload.seq}: orden de entrega intercambiado.`);
          break;
        }
        case "forge":
          this.queue.unshift({ uid: ++this.uid, batch: forgeBatch(head.batch), mark: "forge" });
          this.event(kind, `Se insertó un lote firmado con una clave ML-DSA ajena, imitando al #${seq}.`);
          break;
      }
    }
    this.armed = pending;
  }

  private deliver(item: QueueItem) {
    const res = this.verifier!.ingest(item.batch);
    const c = this.counts;
    c.received += 1;
    this.verifyMs += res.verify_ms;
    switch (res.status) {
      case "ok":
      case "gap":
      case "broken_chain":
        c.valid += 1;
        break;
      case "reordered":
        c.valid += 1;
        c.reordered += 1;
        break;
      case "tampered":
        c.tampered += 1;
        break;
      case "duplicate":
        c.duplicate += 1;
        break;
      case "unknown_key":
        c.forged += 1;
        break;
    }
    const ps = pointStatusOf(res.status);
    const old = this.points.map((p) => (p.fresh ? { ...p, fresh: false } : p));
    if (ps) {
      for (const d of item.batch.payload.detections) {
        old.push({
          key: `${item.uid}:${d.id}`,
          lng: d.longitude,
          lat: d.latitude,
          frp: d.frp,
          status: ps,
          fresh: true,
        });
      }
    }
    this.points = old;
    this.pushLog({ uid: item.uid, kind: "result", batch: item.batch, result: res, mark: item.mark });
  }

  private build(): DemoSnapshot {
    const c = this.counts;
    const missing = this.verifier?.missingSeqs ?? [];
    return {
      ready: !!this.collector && this.source.length > 0,
      playing: this.playing,
      done: this.done,
      speed: this.speed,
      batchSize: this.batchSize,
      totalBatches: this.source.length,
      totalDetections: this.detections.length,
      signed: this.cursor,
      queue: this.queue.map((q) => ({ ...q })),
      armed: [...this.armed],
      log: this.log,
      points: this.points,
      metrics: {
        ...c,
        lost: missing.length,
        avgVerifyMs: c.received ? this.verifyMs / c.received : 0,
        avgSignMs: this.cursor ? this.signMs / this.cursor : 0,
      },
      missing,
      keyId: this.kp?.keyId ?? null,
      keyOrigin: this.keyOrigin,
    };
  }

  private emit() {
    this.snap = this.build();
    for (const fn of this.listeners) fn();
  }
}
