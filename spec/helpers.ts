// A small HTTP client for the product contract tests: it keeps one account's
// cookie and CSRF token and sends the same-origin headers a browser would.
// Every test creates its own uniquely named accounts and works; nothing here
// wipes or seeds the database directly.
import { inject } from "vitest";
import { randomUUID } from "node:crypto";

// spec/ gets the running app from global-setup; tests/ pass their own server's URL.
let injected: string | undefined;
try {
  injected = inject("baseUrl");
} catch {
  injected = undefined;
}
export const baseUrl = injected ?? "http://localhost:8080";

export const uniqueHandle = (prefix = "t"): string =>
  `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`.slice(0, 24);

export interface Res<T = any> {
  status: number;
  body: T;
}

export class Client {
  base: string;
  constructor(base = baseUrl) {
    this.base = base;
  }
  cookie = "";
  csrf = "";
  user: { id: string; handle: string; displayName: string } | null = null;
  recoveryCode = "";

  async req<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
    const h: Record<string, string> = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (method !== "GET") {
      h.origin ??= new URL(this.base).origin;
      if (this.csrf) h["x-csrf-token"] ??= this.csrf;
    }
    if (body !== undefined) h["content-type"] = "application/json";
    const res = await fetch(new URL(path, this.base), { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const set = res.headers.get("set-cookie");
    if (set) {
      const [pair] = set.split(";");
      this.cookie = pair!.endsWith("=") ? "" : pair!;
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, body: parsed as T };
  }

  async register(name = "Tester", password = "correct horse battery"): Promise<this> {
    const handle = uniqueHandle();
    const r = await this.req("POST", "/api/auth/register", { handle, displayName: name, password });
    if (r.status !== 200) throw new Error(`register failed ${r.status} ${JSON.stringify(r.body)}`);
    this.csrf = r.body.csrf;
    this.user = r.body.user;
    this.recoveryCode = r.body.recoveryCode;
    return this;
  }

  async login(handle: string, password: string): Promise<Res> {
    const r = await this.req("POST", "/api/auth/login", { handle, password });
    if (r.status === 200) {
      this.csrf = r.body.csrf;
      this.user = r.body.user;
    }
    return r;
  }

  async createWork(title = "Test work"): Promise<string> {
    const r = await this.req("POST", "/api/works", { title });
    if (r.status !== 200) throw new Error(`create failed ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.id;
  }

  state(workId: string): Promise<Res> {
    return this.req("GET", `/api/works/${workId}/state`);
  }

  /** Submit a command using the freshest view the server reports. */
  async command(workId: string, kind: string, payload: unknown, opts: { commandId?: string; leaseId?: string; epoch?: number; streamId?: string; tick?: number } = {}): Promise<Res> {
    const s = (await this.state(workId)).body;
    return this.req("POST", "/api/commands", {
      v: 1,
      type: "command",
      commandId: opts.commandId ?? randomUUID(),
      workId,
      worldEpoch: opts.epoch ?? s.epoch,
      streamId: opts.streamId ?? s.streamId,
      lastSeenTick: opts.tick ?? s.tick,
      leaseId: opts.leaseId ?? "",
      kind,
      payload,
    });
  }
}

export const FLAT: [number, number, number, number] = [0, 0, 0, 1];
// local X → +Y: 90° about Z
export const VERTICAL: [number, number, number, number] = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

import WebSocket from "ws";

/** A real authenticated editor window over the WebSocket. */
export class Window {
  ws: WebSocket;
  messages: any[] = [];
  private waiters: { pred: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  snapshot: any = null;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", (data) => {
      const m = JSON.parse(data.toString());
      if (m.type === "room.snapshot") this.snapshot = m;
      if (m.type === "lease.changed" && this.snapshot) this.snapshot.lease = m.lease;
      this.messages.push(m);
      for (const w of [...this.waiters]) {
        if (w.pred(m)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(m);
        }
      }
    });
  }

  static async open(client: Client, workId?: string): Promise<Window> {
    const url = new URL("/ws", client.base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url, { headers: { cookie: client.cookie, origin: new URL(client.base).origin } });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
      ws.once("unexpected-response", (_req, res) => reject(new Error(`upgrade refused ${res.statusCode}`)));
    });
    const w = new Window(ws);
    w.send({ type: "hello", csrf: client.csrf });
    await w.waitFor((m) => m.type === "hello.ok");
    if (workId) await w.joinLive(workId);
    return w;
  }

  send(m: unknown): void {
    this.ws.send(JSON.stringify(m));
  }

  async join(workId: string): Promise<any> {
    this.send({ type: "room.join", workId });
    return this.waitFor((m) => m.type === "room.snapshot" && m.workId === workId);
  }

  /**
   * Join and wait for a live room. Only three rooms run at once (WORLD-04)
   * and earlier tests' rooms keep their slot while they settle, so a join can
   * legitimately get the read-only last-saved view first.
   */
  async joinLive(workId: string, timeoutMs = 20_000): Promise<any> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const s = await this.join(workId);
      if (s.live || Date.now() > until) return s;
      await sleep(500);
    }
  }

  waitFor(pred: (m: any) => boolean, timeoutMs = 10_000): Promise<any> {
    const found = this.messages.find(pred);
    if (found) {
      this.messages.splice(this.messages.indexOf(found), 1);
      return Promise.resolve(found);
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
      this.waiters.push({ pred, resolve: (m) => (clearTimeout(t), this.messages.splice(this.messages.indexOf(m), 1), resolve(m)) });
    });
  }

  command(kind: string, payload: unknown, commandId: string = randomUUID()): string {
    const s = this.snapshot;
    this.send({
      v: 1,
      type: "command",
      commandId,
      workId: s.workId,
      worldEpoch: s.epoch,
      streamId: s.streamId,
      lastSeenTick: this.lastTick(),
      leaseId: s.lease?.leaseId ?? "",
      kind,
      payload,
    });
    return commandId;
  }

  result(commandId: string): Promise<any> {
    return this.waitFor((m) => m.type === "command.result" && m.commandId === commandId && m.outcome !== "pending");
  }

  lastTick(): number {
    let t = this.snapshot?.tick ?? 0;
    for (const m of this.messages) if (m.type === "world.frame" && m.streamId === this.snapshot?.streamId) t = Math.max(t, m.tick);
    return t;
  }

  close(): void {
    this.ws.close();
  }
}
