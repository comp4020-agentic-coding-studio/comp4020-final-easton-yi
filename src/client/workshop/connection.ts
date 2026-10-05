// One authenticated socket per workshop window. Reconnects with backoff
// (0.5, 1, 2, 4, then 8 s, with jitter) and asks for full authoritative state
// on every (re)join; never replays queued placements (SYNC-05).
import { TRANSPORT } from "../../shared/config.ts";
import type { ClientMessage, ServerMessage } from "../../shared/protocol.ts";
import { getCsrf } from "../api.ts";

export type ConnStatus = "connecting" | "open" | "reconnecting" | "closed";

export class RoomConnection {
  status: ConnStatus = "connecting";
  private ws: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private timer = 0;
  private heartbeat = 0;
  private hiddenAt = 0;
  private workId: string;
  private onMessage: (m: ServerMessage) => void;
  private onStatus: (s: ConnStatus) => void;
  /** Supplies the held draft so a stationary ghost stays present (SYNC-06). */
  draftPresence: () => { seq: number; pose: { p: [number, number, number]; q: [number, number, number, number] } } | null = () => null;

  constructor(workId: string, onMessage: (m: ServerMessage) => void, onStatus: (s: ConnStatus) => void) {
    this.workId = workId;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.open();
  }

  private setStatus(s: ConnStatus): void {
    this.status = s;
    this.onStatus(s);
  }

  private open(): void {
    if (this.stopped) return;
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "hello", csrf: getCsrf() }));
    };
    ws.onmessage = (ev) => {
      let m: ServerMessage;
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.type === "hello.ok") {
        this.attempt = 0;
        this.setStatus("open");
        this.send({ type: "room.join", workId: this.workId });
        clearInterval(this.heartbeat);
        this.heartbeat = window.setInterval(() => this.send({ type: "heartbeat", draft: this.draftPresence(), visible: !document.hidden }), TRANSPORT.heartbeatMs);
        return;
      }
      this.onMessage(m);
    };
    ws.onclose = (ev) => {
      clearInterval(this.heartbeat);
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      if (ev.code === 4401 || ev.code === 1008) {
        // the session is gone; don't hammer the server
        this.setStatus("closed");
        this.onMessage({ type: "access.ended", reason: "SESSION_EXPIRED" });
        return;
      }
      this.retry();
    };
    ws.onerror = () => undefined;
  }

  private retry(): void {
    this.setStatus("reconnecting");
    const steps = TRANSPORT.reconnectBackoffMs;
    const base = steps[Math.min(this.attempt, steps.length - 1)]!;
    this.attempt++;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.open(), base * (0.75 + Math.random() * 0.5));
  }

  /** Returning from the background: confirm fresh state before placing again (SYNC-07). */
  private onVisibility = (): void => {
    if (document.hidden) {
      this.hiddenAt = Date.now();
      return;
    }
    if (this.hiddenAt && Date.now() - this.hiddenAt > TRANSPORT.heartbeatMs && this.status === "open") {
      this.onMessage({ type: "error", code: "STALE_VIEW", message: "Refreshing after the tab was in the background…" });
      this.send({ type: "room.join", workId: this.workId });
    }
    this.hiddenAt = 0;
  };

  send(m: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.status !== "open") return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ws?.close(1000, "leaving");
    this.ws = null;
    this.setStatus("closed");
  }
}
