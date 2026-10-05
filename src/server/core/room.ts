// One live work: its authoritative physics world, connected windows, editor
// leases, ghosts, mode and save state. Everything here runs inside the
// coordinator's single thread, so commands, ticks and transactions are
// naturally ordered and never interleave (INITIAL_PROMPT §2.2).
import { randomUUID } from "node:crypto";
import { LIMITS, TRANSPORT, type PhysicsConfig } from "../../shared/config.ts";
import type {
  PresenceEntry,
  RemoteDraft,
  RoomMode,
  RoomSnapshotMsg,
  SaveStatus,
  ServerMessage,
  StickInfo,
  WireBody,
} from "../../shared/protocol.ts";
import { PhysicsWorld, type BodyState } from "./physics.ts";
import { makeEnvelope, type EnvelopeMeta, type Store, type WorkRow } from "./store.ts";
import { r4, TokenBucket } from "./util.ts";
import { log } from "../log.ts";

export interface Conn {
  connId: string;
  userId: string;
  displayName: string;
  sessionDigest: string;
  workId: string | null;
  role: "owner" | "editor" | null;
  leaseId: string | null;
  lastHeartbeat: number;
  ephemeral: TokenBucket;
  draftSeq: number;
}

export interface PendingSave {
  actorId: string;
  commandId: string;
  title: string;
  epoch: number;
  digest: string;
}

export type Sender = (connIds: string[], msg: ServerMessage) => void;

export const wireBody = (b: BodyState): WireBody => [
  b.id,
  r4(b.p[0]),
  r4(b.p[1]),
  r4(b.p[2]),
  r4(b.q[0]),
  r4(b.q[1]),
  r4(b.q[2]),
  r4(b.q[3]),
  b.sleeping ? 1 : 0,
];

export class Room {
  readonly workId: string;
  readonly cfg: PhysicsConfig;
  pw: PhysicsWorld;
  streamId = randomUUID();
  title: string;
  ownerId: string;
  epoch: number;
  seq: number;
  bestHeight: number;
  stableHeight: number;
  mode: RoomMode = "build";
  conns = new Map<string, Conn>();
  /** userId → lease; one editing window per account per work (SYNC-06). */
  leases = new Map<string, { leaseId: string; connId: string }>();
  drafts = new Map<string, RemoteDraft>();
  pendingSaves = new Map<string, PendingSave>();
  pushTainted = false;
  push: { protectId: string; since: number; ownerAwaySince: number | null } | null = null;
  quietSince: number | null = null;
  stable = false;
  lastFrameAt = 0;
  /** performance.now() of the last save; the scheduler clock is monotonic. */
  lastCheckpointAt = 0;
  dirty = false;
  savedTick = 0;
  emptySince: number | null = null;
  resumedMotion = false;
  /** Set when a save or the simulation failed; mutations stop until recovery. */
  paused: string | null = null;
  accumulator = 0;
  lastOverloadLogged = false;
  /** Count of passes where the backlog was dropped (the room ran slower than real time). */
  overloads = 0;
  lastStepAt = performance.now();
  authorNames = new Map<string, string>();
  memberColors = new Map<string, number>();

  constructor(row: WorkRow, pw: PhysicsWorld, meta: EnvelopeMeta | null) {
    this.workId = row.id;
    this.cfg = pw.cfg;
    this.pw = pw;
    this.title = row.title;
    this.ownerId = row.owner_id;
    this.epoch = row.world_epoch;
    this.seq = row.command_seq;
    this.bestHeight = row.best_height;
    this.stableHeight = row.stable_height;
    this.pushTainted = meta?.pushTainted ?? false;
    this.resumedMotion = meta?.moving ?? false;
    this.savedTick = pw.tick;
    this.stable = !this.resumedMotion && pw.isQuiet();
  }

  get moving(): boolean {
    return !this.stable;
  }

  saveStatus(): SaveStatus {
    if (this.paused) return "error";
    return this.stable ? "saved" : "moving";
  }

  envelopeMeta(): EnvelopeMeta {
    return { ...this.pw.envelope(), pushTainted: this.pushTainted, moving: this.moving };
  }

  envelope() {
    return makeEnvelope(this.pw.snapshot(), this.envelopeMeta(), this.cfg);
  }

  bodies(): WireBody[] {
    return this.pw.bodies().map(wireBody);
  }

  stickInfo(): StickInfo[] {
    return [...this.pw.sticks.values()].map((s) => ({
      id: s.id,
      authorId: s.authorId,
      authorName: this.authorNames.get(s.authorId) ?? "Former member",
      seed: s.seed,
      placedAt: s.placedAt,
    }));
  }

  connIds(except?: string): string[] {
    return [...this.conns.keys()].filter((c) => c !== except);
  }

  presence(): PresenceEntry[] {
    const byUser = new Map<string, PresenceEntry>();
    for (const c of this.conns.values()) {
      if (!c.role) continue;
      const e = byUser.get(c.userId) ?? {
        userId: c.userId,
        displayName: c.displayName,
        role: c.role,
        color: this.memberColors.get(c.userId) ?? 0,
        editing: false,
        connections: 0,
      };
      e.connections++;
      if (c.leaseId) e.editing = true;
      byUser.set(c.userId, e);
    }
    return [...byUser.values()];
  }

  editorSeatsUsed(): number {
    return this.leases.size;
  }

  snapshotFor(conn: Conn): RoomSnapshotMsg {
    let leaseReason: RoomSnapshotMsg["leaseReason"];
    if (!conn.leaseId) {
      if (this.mode === "archived") leaseReason = "ARCHIVED";
      else if (this.leases.has(conn.userId)) leaseReason = "OTHER_WINDOW";
      else if (this.leases.size >= LIMITS.editorSeatsPerRoom) leaseReason = "ROOM_FULL";
    }
    return {
      type: "room.snapshot",
      workId: this.workId,
      title: this.title,
      role: conn.role ?? "editor",
      live: true,
      streamId: this.streamId,
      epoch: this.epoch,
      seq: this.seq,
      tick: this.pw.tick,
      serverTime: Date.now(),
      lease: conn.leaseId ? { leaseId: conn.leaseId } : null,
      leaseReason,
      mode: this.mode,
      pushOwnerAway: this.push?.ownerAwaySince != null,
      bodies: this.bodies(),
      sticks: this.stickInfo(),
      stableHeight: this.stableHeight,
      bestHeight: this.bestHeight,
      measuring: !this.stable,
      save: this.saveStatus(),
      resumedMotion: this.resumedMotion,
      presence: this.presence(),
      drafts: [...this.drafts.values()].filter((d) => d.leaseId !== conn.leaseId),
      config: { stick: this.cfg.stick, table: this.cfg.table },
    };
  }

  /** Called when the world just received a change that may move it. */
  markMoving(): void {
    this.stable = false;
    this.quietSince = null;
    this.dirty = true;
  }

  /**
   * Fixed 60 Hz steps from a monotonic accumulator, at most four catch-up
   * steps per scheduler pass (§5.4). Returns the collision events and whether
   * the world just became stable.
   */
  advance(now: number, send: Sender, persist: (reason: "checkpoint" | "stable" | "cleanup") => boolean): void {
    const elapsed = (now - this.lastStepAt) / 1000;
    this.lastStepAt = now;
    if (this.paused) return;
    const asleep = this.pw.allSleeping();
    if (asleep && this.stable) {
      this.accumulator = 0;
      return;
    }
    const events: { id: string; p: [number, number, number]; strength: number }[] = [];
    let steps = 0;
    if (!asleep) {
      this.accumulator += elapsed;
      while (this.accumulator >= this.cfg.fixedStep && steps < this.cfg.maxCatchUpSteps) {
        for (const e of this.pw.step()) if (events.length < 8) events.push({ id: e.id, p: [r4(e.p[0]), r4(e.p[1]), r4(e.p[2])], strength: r4(e.strength) });
        this.accumulator -= this.cfg.fixedStep;
        steps++;
      }
      if (this.accumulator > this.cfg.fixedStep * this.cfg.maxCatchUpSteps) {
        // Sustained lag: drop the backlog instead of spiralling; the room runs
        // slower than real time and says so in the log (§5.4).
        this.overloads++;
        if (!this.lastOverloadLogged) {
          log({ event: "room.overload", level: "warn", workId: this.workId, backlogMs: Math.round(this.accumulator * 1000) });
          this.lastOverloadLogged = true;
        }
        this.accumulator = 0;
      } else if (this.lastOverloadLogged && this.accumulator < this.cfg.fixedStep) {
        log({ event: "room.overload.end", workId: this.workId });
        this.lastOverloadLogged = false;
      }
      if (steps > 0) {
        this.dirty = true; // the world moved since the last save
        if (!this.pw.healthy()) {
          this.paused = "PHYSICS_FAULT";
          log({ event: "room.fault", level: "error", workId: this.workId, code: "PHYSICS_FAULT", tick: this.pw.tick });
          send(this.connIds(), { type: "save.status", save: "error", stableHeight: this.stableHeight, bestHeight: this.bestHeight, measuring: true, savedTick: this.savedTick });
          return;
        }
        const removed = this.pw.cleanup();
        if (removed.length) {
          for (const d of removed) log({ event: "stick.removed", workId: this.workId, stickId: d, outcome: "out-of-bounds" });
          persist("cleanup");
          send(this.connIds(), { type: "sticks.removed", streamId: this.streamId, ids: removed });
        }
      }
    }
    if (steps > 0 && (now - this.lastFrameAt >= 1000 / TRANSPORT.frameHz || this.pw.allSleeping())) {
      this.lastFrameAt = now;
      send(this.connIds(), {
        type: "world.frame",
        streamId: this.streamId,
        epoch: this.epoch,
        seq: this.seq,
        tick: this.pw.tick,
        serverTime: Date.now(),
        bodies: this.bodies(),
        events,
      });
    } else if (events.length && this.conns.size) {
      // keep sound events even between frames, without a full body list
      send(this.connIds(), { type: "world.frame", streamId: this.streamId, epoch: this.epoch, seq: this.seq, tick: this.pw.tick, serverTime: Date.now(), bodies: [], events });
    }

    if (this.pw.isQuiet()) {
      this.quietSince ??= now;
      if (!this.stable && now - this.quietSince >= this.cfg.stableSeconds * 1000) {
        this.stable = true;
        this.resumedMotion = false;
        this.stableHeight = this.pw.supportedHeight();
        if (this.mode === "build" && !this.pushTainted) this.bestHeight = Math.max(this.bestHeight, this.stableHeight);
        this.pushTainted = false;
        if (this.mode === "push-running") this.mode = "push-review";
        if (persist("stable")) {
          send(this.connIds(), {
            type: "save.status",
            save: "saved",
            stableHeight: this.stableHeight,
            bestHeight: this.bestHeight,
            measuring: false,
            savedTick: this.savedTick,
          });
        }
        if (this.mode === "push-review") send(this.connIds(), { type: "room.mode", mode: "push-review" });
      }
    } else {
      this.quietSince = null;
      if (this.stable) this.markMoving();
    }
    if (!this.stable && this.dirty && now - this.lastCheckpointAt >= TRANSPORT.checkpointMs) persist("checkpoint");
  }

  /** Build the persisted world row for this room (store.writeState). */
  writeState(store: Store, now: number): void {
    const env = this.envelope();
    store.writeState(this.workId, env, now);
    store.q.updateWorkCounters.run({
      id: this.workId,
      epoch: this.epoch,
      seq: this.seq,
      best: this.bestHeight,
      stable: this.stableHeight,
      count: this.pw.sticks.size,
      now,
    });
    this.savedTick = this.pw.tick;
  }
}
