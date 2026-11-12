// Sondeo periódico de un endpoint JSON con pausa cuando la pestaña está oculta. Sin React.
export interface PollSnapshot<T> {
  data: T | null;
  /** Mensaje del último intento fallido (los datos anteriores se conservan). */
  error: string | null;
  loading: boolean;
  /** Momento local (ms epoch) de la última respuesta válida. */
  loadedAt: number | null;
}

export interface PollDeps {
  fetchJson: (url: string) => Promise<unknown>;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

const defaultDeps = (): PollDeps => ({
  fetchJson: async (url) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
});

/** Reintento tras error: más corto que el intervalo normal, para no dejar el panel vacío mucho tiempo. */
const RETRY_MS = 30000;

export class PollStore<T> {
  private deps: PollDeps;
  private listeners = new Set<() => void>();
  private timer: unknown = null;
  private active = false;
  private visible = true;
  private token = 0;
  private dueAt = 0;
  private snap: PollSnapshot<T> = { data: null, error: null, loading: true, loadedAt: null };

  constructor(
    private url: string,
    private intervalMs: number,
    private validate: (x: unknown) => x is T,
    deps: Partial<PollDeps> = {},
  ) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  start() {
    if (this.active) return;
    this.active = true;
    if (this.visible) void this.load();
  }

  stop() {
    this.active = false;
    this.token += 1;
    this.clear();
  }

  setVisible(visible: boolean) {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!this.active) return;
    if (!visible) {
      this.clear();
      return;
    }
    const remaining = this.dueAt - this.deps.now();
    if (remaining > 0) this.schedule(remaining);
    else void this.load();
  }

  refresh() {
    if (this.active && this.visible) void this.load();
  }

  private clear() {
    if (this.timer !== null) this.deps.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number) {
    this.clear();
    this.dueAt = this.deps.now() + ms;
    this.timer = this.deps.setTimeout(() => {
      this.timer = null;
      if (this.active && this.visible) void this.load();
    }, ms);
  }

  private async load() {
    this.clear();
    const token = ++this.token;
    this.set({ ...this.snap, loading: true });
    try {
      const body = await this.deps.fetchJson(this.url);
      if (token !== this.token) return;
      if (!this.validate(body)) throw new Error("respuesta con formato inesperado");
      this.set({ data: body, error: null, loading: false, loadedAt: this.deps.now() });
      if (this.visible) this.schedule(this.intervalMs);
      else this.dueAt = this.deps.now() + this.intervalMs;
    } catch (e) {
      if (token !== this.token) return;
      this.set({ ...this.snap, loading: false, error: e instanceof Error ? e.message : "error de red" });
      const retry = Math.min(RETRY_MS, this.intervalMs);
      if (this.visible) this.schedule(retry);
      else this.dueAt = this.deps.now() + retry;
    }
  }

  private set(s: PollSnapshot<T>) {
    this.snap = s;
    for (const fn of this.listeners) fn();
  }
}
