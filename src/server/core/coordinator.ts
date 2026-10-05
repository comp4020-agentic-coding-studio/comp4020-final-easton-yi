// The coordinator worker: owns the SQLite connection and every live Rapier
// world. The main thread calls it through typed request/reply messages; all
// room changes, ticks and transactions run here in one order.
import { parentPort, workerData } from "node:worker_threads";
import { randomBytes, randomUUID } from "node:crypto";
import { statfsSync } from "node:fs";
import { openDatabase } from "../db/db.ts";
import { createStore, readEnvelope, makeEnvelope, type Store, type WorkRow } from "./store.ts";
import { initPhysics, PhysicsWorld } from "./physics.ts";
import { Room, wireBody, type Conn, type Sender } from "./room.ts";
import {
  AUTH,
  LIMITS,
  PHYSICS_CONFIGS,
  TRANSPORT,
  currentPhysicsConfig,
  type PhysicsConfig,
} from "../../shared/config.ts";
import {
  ClientMessageS,
  PlacePayload,
  PushConfirmPayload,
  RestorePayload,
  SnapshotPayload,
  type ClientMessage,
  type Command,
  type CommandResultMsg,
  type ErrorCode,
  type RoomSnapshotMsg,
  type ServerMessage,
} from "../../shared/protocol.ts";
import { AppError, isAppError } from "../errors.ts";
import { log } from "../log.ts";
import { sha256, stableJson, TokenBucket, r4 } from "./util.ts";
import type { Pose } from "../../shared/geometry.ts";

export interface CoordinatorOptions {
  dataDir: string;
  testHooks: boolean;
}

const opts = workerData as CoordinatorOptions;
const port = parentPort!;
await initPhysics();
const store: Store = createStore(openDatabase(opts.dataDir));
const rooms = new Map<string, Room>();
let overloadEvents = 0; // from rooms already unloaded
const conns = new Map<string, Conn>();
const commandBuckets = new Map<string, TokenBucket>();
const testState = { failWrites: false };

const send: Sender = (connIds, msg) => {
  if (connIds.length) port.postMessage({ kind: "send", conns: connIds, data: JSON.stringify(msg) });
};
const closeConn = (connId: string, code: number, reason: string): void => {
  port.postMessage({ kind: "close", connId, code, reason });
};

const crashPoint = (name: string): void => {
  if (opts.testHooks && process.env.CRASH_AT === name) {
    log({ event: "test.crash", level: "warn", at: name });
    process.kill(process.pid, "SIGKILL");
  }
};

// ---------------------------------------------------------------- helpers

const now = (): number => Date.now();

const configFor = (row: WorkRow): PhysicsConfig => {
  const frozen = JSON.parse(row.physics_config) as PhysicsConfig;
  const registered = PHYSICS_CONFIGS[row.physics_config_version];
  if (!registered) throw new AppError("INCOMPATIBLE", `Unknown physics configuration ${row.physics_config_version}`);
  return frozen;
};

const requireStorage = (): void => {
  try {
    const s = statfsSync(opts.dataDir);
    if (s.bavail * s.bsize < LIMITS.storageReserveBytes) {
      throw new AppError("STORAGE_FULL", "The server's storage is nearly full, so new changes are paused. Existing work stays readable.");
    }
  } catch (e) {
    if (isAppError(e)) throw e;
  }
};

/** Durable write wrapper: test hook for a failed write, storage admission. */
const durable = <T>(f: () => T): T => {
  requireStorage();
  return store.tx(() => {
    if (testState.failWrites) throw new Error("injected write failure");
    return f();
  });
};

const membership = (workId: string, userId: string) => store.q.member.get(workId, userId) ?? null;

const trashedMessage = (role: "owner" | "editor"): string =>
  role === "owner"
    ? "This work is in your trash. Restore it from My works → Trash to use it again."
    : "The owner has moved this work to the trash, so it isn't available. Only the owner can restore it; you can leave it from My works.";

const requireMember = (workId: string, userId: string, opts: { allowTrashed?: boolean } = {}): { work: WorkRow; role: "owner" | "editor" } => {
  const work = store.q.work.get(workId);
  const m = work && membership(workId, userId);
  // One answer for "missing" and "not yours", so private works don't leak.
  if (!work || !m) throw new AppError("NOT_FOUND", "That work doesn't exist or you don't have access to it.");
  // Members already know the work exists, so they get an explanation, never data.
  if (work.trashed_at != null && !opts.allowTrashed) throw new AppError("TRASHED", trashedMessage(m.role));
  return { work, role: m.role };
};

const requireOwner = (workId: string, userId: string, opts: { allowTrashed?: boolean } = {}): WorkRow => {
  const { work, role } = requireMember(workId, userId, opts);
  if (role !== "owner") throw new AppError("NOT_OWNER", "Only the owner can do that.");
  return work;
};

/**
 * WORLD-04 storage bound on creating exhibits: every retained exhibit counts,
 * public or withdrawn, since a withdrawn one keeps its frozen geometry.
 * Republishing reuses its row (same ID, same geometry) and is never checked.
 * Call inside the write transaction: the coordinator serializes requests.
 */
const requireExhibitSlot = (workId: string): void => {
  const n = store.db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM exhibits WHERE work_id = ?").get(workId)!.n;
  if (n >= LIMITS.exhibitsPerWork) {
    throw new AppError(
      "LIMIT",
      `This work has ${n} exhibits, counting withdrawn ones; the limit is ${LIMITS.exhibitsPerWork}. Withdrawing doesn't free a slot, but you can republish a withdrawn exhibit.`,
    );
  }
};

const displayName = (userId: string): string => store.q.userById.get(userId)?.display_name ?? "Former member";

const refreshNames = (room: Room): void => {
  const members = store.q.members.all(room.workId);
  members.forEach((m, i) => room.memberColors.set(m.user_id, i % 8));
  for (const s of room.pw.sticks.values()) {
    if (!room.authorNames.has(s.authorId)) room.authorNames.set(s.authorId, displayName(s.authorId));
  }
  for (const m of members) room.authorNames.set(m.user_id, m.display_name);
};

// ---------------------------------------------------------------- rooms

const loadWorld = (row: WorkRow): { pw: PhysicsWorld; meta: ReturnType<typeof readEnvelope>["meta"] } => {
  const cfg = configFor(row);
  const stateRow = store.q.state.get(row.id);
  if (!stateRow) throw new AppError("INTERNAL", "Work has no saved world");
  const env = readEnvelope(stateRow);
  return { pw: PhysicsWorld.restore(cfg, env.blob, env.meta), meta: env.meta };
};

const activate = (workId: string): Room => {
  const existing = rooms.get(workId);
  if (existing) return existing;
  const row = store.q.work.get(workId);
  if (!row) throw new AppError("NOT_FOUND", "That work doesn't exist or you don't have access to it.");
  if (row.trashed_at != null) throw new AppError("TRASHED", "This work is in the trash.");
  if (row.archived) throw new AppError("ARCHIVED", "This work is archived. The owner can unarchive it to continue.");
  if (rooms.size >= LIMITS.activeRooms) {
    // A settled room nobody is in is already saved and isn't stepped; its slot
    // can go to someone who wants to build now. Moving or occupied rooms keep theirs.
    const idle = [...rooms.values()].find((r) => r.conns.size === 0 && r.stable && !r.paused && r.pendingSaves.size === 0);
    if (idle) unload(idle, "evicted-for-activation");
  }
  if (rooms.size >= LIMITS.activeRooms) {
    throw new AppError("ROOM_LIMIT", "All live building rooms are busy right now. You're seeing the last saved state; live building hasn't started.");
  }
  const { pw, meta } = loadWorld(row);
  const room = new Room(row, pw, meta);
  room.emptySince = now();
  refreshNames(room);
  rooms.set(workId, room);
  log({ event: "room.activate", workId, streamId: room.streamId, sticks: pw.sticks.size, resumedMotion: room.resumedMotion });
  return room;
};

const persistRoom = (room: Room, reason: "checkpoint" | "stable" | "cleanup" | "suspend" | "shutdown"): boolean => {
  const t = performance.now();
  try {
    durable(() => room.writeState(store, now()));
    room.lastCheckpointAt = performance.now();
    room.dirty = false;
    if (reason !== "checkpoint") log({ event: "world.save", workId: room.workId, reason, tick: room.pw.tick, durationMs: r4(performance.now() - t) });
    return true;
  } catch (e) {
    room.paused = "SAVE_FAILED";
    log({ event: "world.save", level: "error", workId: room.workId, reason, outcome: "failed", code: isAppError(e) ? e.code : "SAVE_FAILED", error: String(e) });
    send(room.connIds(), { type: "save.status", save: "error", stableHeight: room.stableHeight, bestHeight: room.bestHeight, measuring: true, savedTick: room.savedTick });
    return false;
  }
};

const unload = (room: Room, reason: string): void => {
  if (!room.paused) persistRoom(room, "suspend");
  room.pw.free();
  overloadEvents += room.overloads;
  rooms.delete(room.workId);
  log({ event: "room.suspend", workId: room.workId, reason, moving: room.moving });
};

/** Last saved state for windows that cannot join a live room (WORLD-04). */
const offlineSnapshot = (row: WorkRow, role: "owner" | "editor", reason: ErrorCode): RoomSnapshotMsg => {
  const { pw, meta } = loadWorld(row);
  try {
    const names = new Map(store.q.members.all(row.id).map((m) => [m.user_id, m.display_name]));
    return {
      type: "room.snapshot",
      workId: row.id,
      title: row.title,
      role,
      live: false,
      liveReason: reason,
      streamId: "offline",
      epoch: row.world_epoch,
      seq: row.command_seq,
      tick: pw.tick,
      serverTime: now(),
      lease: null,
      leaseReason: row.archived ? "ARCHIVED" : "NOT_LIVE",
      mode: row.archived ? "archived" : "offline",
      bodies: pw.bodies().map(wireBody),
      sticks: [...pw.sticks.values()].map((s) => ({
        id: s.id,
        authorId: s.authorId,
        authorName: names.get(s.authorId) ?? displayName(s.authorId),
        seed: s.seed,
        placedAt: s.placedAt,
      })),
      stableHeight: row.stable_height,
      bestHeight: row.best_height,
      measuring: meta.moving,
      save: meta.moving ? "suspended" : "saved",
      resumedMotion: false,
      presence: [],
      drafts: [],
      config: { stick: pw.cfg.stick, table: pw.cfg.table },
    };
  } finally {
    pw.free();
  }
};

// ---------------------------------------------------------------- leases & connections

const grantLease = (room: Room, conn: Conn): void => {
  if (conn.leaseId || room.mode === "archived") return;
  if (room.leases.has(conn.userId)) return;
  if (room.leases.size >= LIMITS.editorSeatsPerRoom) return;
  conn.leaseId = randomUUID();
  room.leases.set(conn.userId, { leaseId: conn.leaseId, connId: conn.connId });
};

const dropLease = (room: Room, conn: Conn, reason: string): void => {
  if (!conn.leaseId) return;
  const leaseId = conn.leaseId;
  room.drafts.delete(leaseId);
  room.leases.delete(conn.userId);
  conn.leaseId = null;
  send(room.connIds(conn.connId), { type: "draft.removed", leaseId });
  send([conn.connId], { type: "lease.changed", lease: null, reason });
};

const leaveRoom = (conn: Conn, reason: string): void => {
  const room = conn.workId ? rooms.get(conn.workId) : undefined;
  if (room) {
    dropLease(room, conn, reason);
    room.conns.delete(conn.connId);
    // a free seat may go to another window of a member waiting to edit
    for (const other of room.conns.values()) {
      if (!other.leaseId && other.role) {
        const before = other.leaseId;
        grantLease(room, other);
        if (other.leaseId && other.leaseId !== before) send([other.connId], { type: "lease.changed", lease: { leaseId: other.leaseId } });
      }
    }
    if (room.push && conn.userId === room.ownerId && ![...room.conns.values()].some((c) => c.userId === room.ownerId)) {
      room.push.ownerAwaySince = now();
      send(room.connIds(), { type: "room.mode", mode: room.mode, pushOwnerAway: true, message: "The owner disconnected during a push. The lock clears in 10 seconds if they don't return." });
    }
    if (room.conns.size === 0) room.emptySince = now();
    send(room.connIds(), { type: "presence", presence: room.presence() });
    log({ event: "room.leave", actorId: conn.userId, workId: room.workId, reason });
  }
  conn.workId = null;
  conn.role = null;
};

const endAccess = (conn: Conn, reason: "LOGGED_OUT" | "SESSION_EXPIRED" | "REMOVED" | "LEFT" | "ARCHIVED"): void => {
  const room = conn.workId ? rooms.get(conn.workId) : undefined;
  if (room) cancelPendingSave(room, conn.userId, "cancelled");
  leaveRoom(conn, reason);
  send([conn.connId], { type: "access.ended", reason });
};

const joinRoom = (conn: Conn, workId: string): void => {
  if (conn.workId) leaveRoom(conn, "switch");
  let access: ReturnType<typeof requireMember>;
  try {
    access = requireMember(workId, conn.userId);
  } catch (e) {
    if (isAppError(e) && e.code === "TRASHED") {
      send([conn.connId], { type: "access.ended", reason: "TRASHED", message: e.message });
      return;
    }
    throw e;
  }
  const { work, role } = access;
  let room: Room;
  try {
    room = activate(workId);
  } catch (e) {
    if (isAppError(e) && (e.code === "ROOM_LIMIT" || e.code === "ARCHIVED")) {
      // remembered so a later trash can tell this read-only window too
      conn.workId = workId;
      conn.role = role;
      send([conn.connId], offlineSnapshot(work, role, e.code));
      log({ event: "room.join", actorId: conn.userId, workId, outcome: "offline", code: e.code });
      return;
    }
    throw e;
  }
  conn.workId = workId;
  conn.role = role;
  conn.displayName = displayName(conn.userId);
  room.conns.set(conn.connId, conn);
  room.emptySince = null;
  refreshNames(room);
  grantLease(room, conn);
  if (room.push && conn.userId === room.ownerId && room.push.ownerAwaySince != null) {
    room.push.ownerAwaySince = null;
    send(room.connIds(), { type: "room.mode", mode: room.mode, pushOwnerAway: false });
  }
  send([conn.connId], room.snapshotFor(conn));
  send(room.connIds(conn.connId), { type: "presence", presence: room.presence() });
  log({ event: "room.join", actorId: conn.userId, actorName: conn.displayName, workId, outcome: conn.leaseId ? "editor" : "observer", streamId: room.streamId });
};

// ---------------------------------------------------------------- commands

type Actor = { userId: string; connId?: string };

const resultFromReceipt = (row: { response: string }): CommandResultMsg => JSON.parse(row.response) as CommandResultMsg;

const reject = (cmd: Command, code: ErrorCode, message: string, extra: Partial<CommandResultMsg> = {}): CommandResultMsg => ({
  type: "command.result",
  commandId: cmd.commandId,
  kind: cmd.kind,
  outcome: "rejected",
  code,
  message,
  ...extra,
});

/** Validation rejections are durable receipts, so a query by the same ID gets the same answer. */
const storeReceipt = (actorId: string, cmd: Command, digest: string, result: CommandResultMsg): void => {
  store.q.insertReceipt.run(
    actorId,
    cmd.commandId,
    cmd.workId,
    cmd.kind,
    digest,
    result.outcome,
    result.code ?? null,
    result.seq ?? null,
    result.epoch ?? null,
    JSON.stringify(result),
    now(),
  );
};

const commandDigest = (actorId: string, cmd: Command): string =>
  sha256(stableJson({ a: actorId, w: cmd.workId, k: cmd.kind, p: cmd.payload, e: cmd.worldEpoch }));

const TRANSIENT: ErrorCode[] = ["RATE_LIMITED", "BUSY", "SAVE_FAILED", "STORAGE_FULL", "ROOM_LIMIT", "ROOM_PAUSED", "NOT_STABLE"];

/** Results already sent to the actor's windows during execution (in order with their broadcast). */
const delivered = new WeakSet<CommandResultMsg>();

const deliver = (actor: Actor, result: CommandResultMsg, workId: string): void => {
  delivered.add(result);
  const room = rooms.get(workId);
  const targets = new Set<string>();
  if (actor.connId) targets.add(actor.connId);
  if (room) for (const c of room.conns.values()) if (c.userId === actor.userId) targets.add(c.connId);
  send([...targets], result);
};

function submitCommand(actor: Actor, cmd: Command): CommandResultMsg {
  const t0 = performance.now();
  const digest = commandDigest(actor.userId, cmd);
  // Resolve an existing receipt before anything else (§4.2), but only for a
  // currently authorised actor.
  const prior = store.q.receipt.get(actor.userId, cmd.commandId);
  if (prior) {
    try {
      requireMember(prior.work_id, actor.userId);
    } catch (e) {
      if (isAppError(e)) return reject(cmd, e.code, e.message);
      throw e;
    }
    if (prior.digest !== digest) return reject(cmd, "IDEMPOTENCY_CONFLICT", "This request ID was already used for a different action.");
    return resultFromReceipt(prior);
  }
  let result: CommandResultMsg;
  try {
    result = execute(actor, cmd, digest);
  } catch (e) {
    const code: ErrorCode = isAppError(e) ? e.code : "INTERNAL";
    if (!isAppError(e)) log({ event: "command.error", level: "error", actorId: actor.userId, workId: cmd.workId, commandId: cmd.commandId, error: String(e) });
    result = reject(cmd, code, isAppError(e) ? e.message : "Something went wrong on the server.", isAppError(e) && e.retryAfterMs ? { retryAfterMs: e.retryAfterMs } : {});
    if (!TRANSIENT.includes(code) && code !== "NOT_FOUND" && code !== "INTERNAL" && membership(cmd.workId, actor.userId)) {
      try {
        storeReceipt(actor.userId, cmd, digest, result);
      } catch {
        // a receipt we couldn't store just means a later query says "unknown"
      }
    }
  }
  log({
    event: `command.${cmd.kind}`,
    actorId: actor.userId,
    workId: cmd.workId,
    commandId: cmd.commandId,
    epoch: result.epoch,
    seq: result.seq,
    outcome: result.outcome,
    code: result.code,
    durationMs: r4(performance.now() - t0),
  });
  return result;
}

function execute(actor: Actor, cmd: Command, digest: string): CommandResultMsg {
  const { work, role } = requireMember(cmd.workId, actor.userId);
  if (work.archived) throw new AppError("ARCHIVED", "This work is archived.");
  const bucketKey = actor.userId;
  const bucket = commandBuckets.get(bucketKey) ?? new TokenBucket(TRANSPORT.commandsPerSecond, TRANSPORT.commandBurst);
  commandBuckets.set(bucketKey, bucket);
  const room = activate(cmd.workId);
  if (room.paused) throw new AppError("ROOM_PAUSED", "Saving failed, so building is paused to protect the last reliable state.");
  if (cmd.worldEpoch !== room.epoch) {
    throw new AppError("STALE_WORLD", "The work was restored since you prepared this. Review your stick and try again.");
  }
  if (cmd.streamId !== room.streamId) throw new AppError("STALE_VIEW", "Your view is out of date. It has been refreshed; check your stick and place again.");
  if (!room.stable && room.pw.tick - cmd.lastSeenTick > TRANSPORT.freshTicks) {
    throw new AppError("STALE_VIEW", "Your view fell behind the moving structure. It has been refreshed; check your stick and place again.");
  }
  const needsLease = cmd.kind === "place" || cmd.kind.startsWith("push.");
  if (needsLease) {
    const lease = room.leases.get(actor.userId);
    if (!lease) throw new AppError("NO_LEASE", "This window is observing. Take over editing to place sticks.");
    if (lease.leaseId !== cmd.leaseId) throw new AppError("STALE_LEASE", "Editing moved to another window.");
  }
  const rate = bucket.take();
  if (!rate.ok) throw new AppError("RATE_LIMITED", "Too many actions at once. Your stick is kept; try again in a moment.", rate.retryAfterMs);

  switch (cmd.kind) {
    case "place":
      return place(actor, cmd, digest, room);
    case "push.prepare":
    case "push.confirm":
    case "push.cancel":
    case "push.keep":
      if (role !== "owner") throw new AppError("NOT_OWNER", "Only the owner can push.");
      return pushCommand(actor, cmd, digest, room);
    case "restore":
      if (role !== "owner") throw new AppError("NOT_OWNER", "Only the owner can restore a version.");
      return restore(actor, cmd, digest, room);
    case "snapshot.create":
      return createSnapshotCommand(actor, cmd, digest, room);
    case "snapshot.cancel": {
      const cancelled = cancelPendingSave(room, actor.userId, "cancelled");
      const result: CommandResultMsg = { type: "command.result", commandId: cmd.commandId, kind: cmd.kind, outcome: cancelled ? "accepted" : "rejected", code: cancelled ? undefined : "NOT_FOUND" };
      storeReceipt(actor.userId, cmd, digest, result);
      return result;
    }
  }
}

function place(actor: Actor, cmd: Command, digest: string, room: Room): CommandResultMsg {
  const parsed = PlacePayload.safeParse(cmd.payload);
  if (!parsed.success) throw new AppError("BAD_REQUEST", "Malformed placement.");
  if (room.mode !== "build") throw new AppError("MODE", "Placement is paused while the owner pushes the structure.");
  if (room.pw.sticks.size >= LIMITS.sticksPerWork) {
    throw new AppError("CAPACITY", `This work has reached ${LIMITS.sticksPerWork} sticks. Restore a version or archive it to keep the structure.`);
  }
  const pose = parsed.data.pose as Pose;
  const check = room.pw.checkPlacement(pose);
  if (check.problem === "COLLISION") throw new AppError("COLLISION", "That spot intersects another stick or the table. Adjust the position.");
  if (check.problem === "OUT_OF_BOUNDS") throw new AppError("OUT_OF_BOUNDS", "That spot is outside the building area.");
  if (check.problem === "NON_FINITE") throw new AppError("NON_FINITE", "That pose isn't valid.");
  requireStorage();

  // Rollback point: the in-memory world before this mutation (§4.3 step 2).
  const before = { bytes: room.pw.snapshot(), env: room.pw.envelope() };
  const stickId = randomUUID();
  room.pw.addStick({ id: stickId, authorId: actor.userId, createdBy: cmd.commandId, seed: randomBytes(4).readUInt32LE(), placedAt: now() }, pose);
  const seq = room.seq + 1;
  const result: CommandResultMsg = { type: "command.result", commandId: cmd.commandId, kind: "place", outcome: "accepted", seq, epoch: room.epoch, stickId };
  const wasStable = room.stable;
  room.stable = false; // a fresh dynamic body: persist as moving
  try {
    crashPoint("before-commit");
    durable(() => {
      store.q.copyToPrevious.run(room.workId);
      room.seq = seq;
      room.writeState(store, now());
      storeReceipt(actor.userId, cmd, digest, result);
    });
  } catch (e) {
    room.seq = seq - 1;
    room.stable = wasStable;
    room.pw.free();
    room.pw = PhysicsWorld.restore(room.cfg, before.bytes, before.env);
    if (isAppError(e)) throw e;
    room.paused = "SAVE_FAILED";
    log({ event: "world.save", level: "error", workId: room.workId, commandId: cmd.commandId, outcome: "failed", error: String(e) });
    send(room.connIds(), { type: "save.status", save: "error", stableHeight: room.stableHeight, bestHeight: room.bestHeight, measuring: true, savedTick: room.savedTick });
    throw new AppError("SAVE_FAILED", "The placement could not be saved, so it was not added. Building is paused to protect your work.");
  }
  crashPoint("after-commit");
  room.markMoving();
  room.lastCheckpointAt = performance.now();
  room.dirty = false;
  room.authorNames.set(actor.userId, displayName(actor.userId));
  const info = room.stickInfo().find((s) => s.id === stickId)!;
  const body = room.pw.bodies().find((b) => b.id === stickId)!;
  deliver(actor, result, room.workId);
  send(room.connIds(), { type: "sticks.added", streamId: room.streamId, epoch: room.epoch, seq, sticks: [info], bodies: [wireBody(body)] });
  send(room.connIds(), { type: "save.status", save: "moving", stableHeight: room.stableHeight, bestHeight: room.bestHeight, measuring: true, savedTick: room.savedTick });
  return result;
}

// ---------------------------------------------------------------- snapshots / versions

const publicGeometry = (room: Room) => ({
  v: 1,
  stick: room.cfg.stick,
  table: room.cfg.table,
  sticks: room.pw.bodies().map((b) => {
    const meta = room.pw.sticks.get(b.id)!;
    return { id: b.id, p: b.p.map(r4), q: b.q.map(r4), seed: meta.seed, authorId: meta.authorId };
  }),
});

const insertSnapshot = (room: Room, creatorId: string, kind: "named" | "restore-protect" | "push-protect", title: string): string => {
  const id = randomUUID();
  const env = room.envelope();
  store.db
    .prepare(
      `INSERT INTO snapshots (id, work_id, creator_id, kind, title, blob, meta, tick, engine, config_version, schema_version,
        checksum, height, stick_count, source_epoch, source_seq, stable, geometry, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      room.workId,
      creatorId,
      kind,
      title,
      Buffer.from(env.blob),
      JSON.stringify(env.meta),
      env.meta.tick,
      env.engine,
      env.configVersion,
      env.schemaVersion,
      env.checksum,
      room.stableHeight,
      room.pw.sticks.size,
      room.epoch,
      room.seq,
      room.stable ? 1 : 0,
      JSON.stringify(publicGeometry(room)),
      now(),
    );
  if (kind !== "named") {
    // Bounded recovery ring: keep the latest N automatic points, never one an
    // active push still needs (SAVE-08).
    const keep = room.push?.protectId ?? "";
    store.db
      .prepare(
        `DELETE FROM snapshots WHERE work_id = ? AND kind != 'named' AND id != ? AND id NOT IN (
           SELECT id FROM snapshots WHERE work_id = ? AND kind != 'named' ORDER BY created_at DESC, rowid DESC LIMIT ?)
         AND id NOT IN (SELECT snapshot_id FROM exhibits)`,
      )
      .run(room.workId, keep, room.workId, LIMITS.recoveryPointsPerWork);
  }
  return id;
};

function createSnapshotCommand(actor: Actor, cmd: Command, digest: string, room: Room): CommandResultMsg {
  const parsed = SnapshotPayload.safeParse(cmd.payload);
  if (!parsed.success) throw new AppError("BAD_REQUEST", "A version needs a title of 1–80 characters.");
  const named = store.db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM snapshots WHERE work_id = ? AND kind = 'named'").get(room.workId)!.n;
  if (named >= LIMITS.namedVersionsPerWork) {
    throw new AppError("LIMIT", `This work has ${LIMITS.namedVersionsPerWork} saved versions. Remove one you no longer need first.`);
  }
  if (!room.stable) {
    if (!parsed.data.whenSettled) throw new AppError("NOT_STABLE", "The structure is still moving. Save when it settles, or cancel.");
    const existing = room.pendingSaves.get(actor.userId);
    if (existing && existing.commandId !== cmd.commandId) cancelPendingSave(room, actor.userId, "cancelled");
    room.pendingSaves.set(actor.userId, { actorId: actor.userId, commandId: cmd.commandId, title: parsed.data.title, epoch: room.epoch, digest });
    return { type: "command.result", commandId: cmd.commandId, kind: cmd.kind, outcome: "pending", message: "Will save when the structure settles." };
  }
  return commitSnapshot(actor.userId, cmd.commandId, digest, room, parsed.data.title, cmd);
}

function commitSnapshot(actorId: string, commandId: string, digest: string, room: Room, title: string, cmd?: Command): CommandResultMsg {
  const c: Command = cmd ?? { v: 1, type: "command", commandId, workId: room.workId, worldEpoch: room.epoch, streamId: room.streamId, lastSeenTick: room.pw.tick, leaseId: "", kind: "snapshot.create", payload: {} };
  let snapshotId = "";
  const result = (): CommandResultMsg => ({ type: "command.result", commandId, kind: "snapshot.create", outcome: "accepted", snapshotId, epoch: room.epoch, seq: room.seq });
  durable(() => {
    snapshotId = insertSnapshot(room, actorId, "named", title);
    storeReceipt(actorId, c, digest, result());
  });
  log({ event: "version.create", actorId, workId: room.workId, commandId, snapshotId, outcome: "accepted", height: room.stableHeight });
  return result();
}

function cancelPendingSave(room: Room, userId: string, outcome: "cancelled" | "interrupted"): boolean {
  const p = room.pendingSaves.get(userId);
  if (!p) return false;
  room.pendingSaves.delete(userId);
  const result: CommandResultMsg = { type: "command.result", commandId: p.commandId, kind: "snapshot.create", outcome, message: "The waiting save was cancelled." };
  try {
    store.q.insertReceipt.run(userId, p.commandId, room.workId, "snapshot.create", p.digest, outcome, null, null, null, JSON.stringify(result), now());
  } catch {
    // receipt already exists
  }
  deliver({ userId }, result, room.workId);
  log({ event: "version.pending", actorId: userId, workId: room.workId, commandId: p.commandId, outcome });
  return true;
}

const resolvePendingSaves = (room: Room): void => {
  for (const p of [...room.pendingSaves.values()]) {
    room.pendingSaves.delete(p.actorId);
    if (p.epoch !== room.epoch || !membership(room.workId, p.actorId)) continue;
    try {
      const result = commitSnapshot(p.actorId, p.commandId, p.digest, room, p.title);
      deliver({ userId: p.actorId }, result, room.workId);
    } catch (e) {
      deliver({ userId: p.actorId }, { type: "command.result", commandId: p.commandId, kind: "snapshot.create", outcome: "rejected", code: isAppError(e) ? e.code : "SAVE_FAILED", message: isAppError(e) ? e.message : "Saving the version failed." }, room.workId);
    }
  }
};

// ---------------------------------------------------------------- restore & push

function restore(actor: Actor, cmd: Command, digest: string, room: Room): CommandResultMsg {
  const parsed = RestorePayload.safeParse(cmd.payload);
  if (!parsed.success) throw new AppError("BAD_REQUEST", "Malformed restore.");
  const target = store.db
    .prepare<[string, string], { id: string; blob: Buffer; meta: string; tick: number; engine: string; config_version: number; schema_version: number; checksum: string; title: string; kind: string; height: number }>(
      "SELECT * FROM snapshots WHERE id = ? AND work_id = ?",
    )
    .get(parsed.data.snapshotId, room.workId);
  if (!target) throw new AppError("NOT_FOUND", "That version doesn't exist.");
  if (target.config_version !== room.cfg.physicsConfigVersion) throw new AppError("INCOMPATIBLE", "That version uses a different physics configuration.");
  if (room.mode === "push-running") throw new AppError("MODE", "Wait for the push to settle before restoring.");
  const env = readEnvelope(target);
  const candidate = PhysicsWorld.restore(room.cfg, env.blob, env.meta);
  const epoch = room.epoch + 1;
  const seq = room.seq + 1;
  const result: CommandResultMsg = { type: "command.result", commandId: cmd.commandId, kind: "restore", outcome: "accepted", epoch, seq, snapshotId: target.id };
  const old = room.pw;
  try {
    durable(() => {
      // protection point of the current state first: if it can't be saved,
      // nothing is restored (SAVE-05)
      insertSnapshot(room, actor.userId, "restore-protect", `Before restoring “${target.title}”`);
      store.q.copyToPrevious.run(room.workId);
      room.pw = candidate;
      room.epoch = epoch;
      room.seq = seq;
      room.stable = false;
      room.pushTainted = false;
      room.writeState(store, now());
      storeReceipt(actor.userId, cmd, digest, result);
    });
  } catch (e) {
    room.pw = old;
    room.epoch = epoch - 1;
    room.seq = seq - 1;
    candidate.free();
    throw isAppError(e) ? e : new AppError("SAVE_FAILED", "Couldn't save a recovery point, so nothing was restored.");
  }
  old.free();
  room.streamId = randomUUID();
  room.stableHeight = target.height;
  room.mode = "build";
  room.push = null;
  room.markMoving();
  room.drafts.clear();
  for (const p of [...room.pendingSaves.keys()]) cancelPendingSave(room, p, "cancelled");
  refreshNames(room);
  deliver(actor, result, room.workId);
  send(room.connIds(), { type: "room.reset", reason: "restore" });
  for (const c of room.conns.values()) send([c.connId], room.snapshotFor(c));
  log({ event: "work.restore", actorId: actor.userId, workId: room.workId, commandId: cmd.commandId, snapshotId: target.id, epoch, seq, outcome: "accepted", streamId: room.streamId });
  return result;
}

function pushCommand(actor: Actor, cmd: Command, digest: string, room: Room): CommandResultMsg {
  const ok = (extra: Partial<CommandResultMsg> = {}): CommandResultMsg => {
    const r: CommandResultMsg = { type: "command.result", commandId: cmd.commandId, kind: cmd.kind, outcome: "accepted", epoch: room.epoch, seq: room.seq, ...extra };
    storeReceipt(actor.userId, cmd, digest, r);
    deliver(actor, r, room.workId);
    return r;
  };
  const announce = (message: string): void =>
    send(room.connIds(), { type: "room.mode", mode: room.mode, actorName: displayName(actor.userId), message, pushOwnerAway: false });
  switch (cmd.kind) {
    case "push.prepare": {
      if (room.mode !== "build") throw new AppError("MODE", "A push is already in progress.");
      if (!room.stable) throw new AppError("NOT_STABLE", "Pushing starts from a settled structure. Wait for it to settle.");
      let protectId = "";
      durable(() => {
        protectId = insertSnapshot(room, actor.userId, "push-protect", "Before push");
      });
      room.mode = "push-selecting";
      room.push = { protectId, since: now(), ownerAwaySince: null };
      announce("The owner is preparing to push. New placements are paused.");
      log({ event: "push.prepare", actorId: actor.userId, workId: room.workId, snapshotId: protectId, outcome: "accepted" });
      return ok({ snapshotId: protectId });
    }
    case "push.confirm": {
      if (room.mode !== "push-selecting") throw new AppError("MODE", "Choose push mode first.");
      const parsed = PushConfirmPayload.safeParse(cmd.payload);
      if (!parsed.success) throw new AppError("BAD_REQUEST", "Malformed push.");
      const { stickId, point, direction } = parsed.data;
      if (!room.pw.sticks.has(stickId)) throw new AppError("NOT_FOUND", "That stick is gone.");
      if (room.pw.surfaceDistance(stickId, point) > 0.15) throw new AppError("BAD_REQUEST", "The push point must be on the stick's surface.");
      if (!(Math.hypot(direction[0], direction[2]) > 1e-3)) throw new AppError("BAD_REQUEST", "Choose a horizontal direction.");
      room.pw.applyPush(stickId, point, direction);
      room.pushTainted = true;
      room.mode = "push-running";
      room.markMoving();
      persistRoom(room, "checkpoint");
      announce("Pushed. Watching what happens…");
      return ok({ snapshotId: room.push?.protectId });
    }
    case "push.cancel": {
      if (room.mode !== "push-selecting") throw new AppError("MODE", "There is no push to cancel.");
      room.mode = "build";
      room.push = null;
      announce("Push cancelled. Building continues.");
      return ok();
    }
    case "push.keep": {
      if (room.mode !== "push-review") throw new AppError("MODE", "Keep is available once the pushed structure settles.");
      room.mode = "build";
      room.push = null;
      announce("The owner kept the result. Building continues.");
      return ok();
    }
    default:
      throw new AppError("BAD_REQUEST", "Unknown push step.");
  }
}

const pushTimers = (room: Room): void => {
  if (!room.push) return;
  const t = now();
  const ownerAway = room.push.ownerAwaySince;
  if (ownerAway != null && t - ownerAway >= TRANSPORT.pushOwnerGraceMs && room.mode !== "push-running") {
    room.mode = "build";
    room.push = null;
    send(room.connIds(), { type: "room.mode", mode: "build", message: "The push lock was cleared because the owner left. The scene and its recovery point are kept." });
    log({ event: "push.lock.cleared", workId: room.workId, reason: "owner-away" });
  } else if (room.mode === "push-selecting" && t - room.push.since >= TRANSPORT.pushSelectIdleMs) {
    room.mode = "build";
    room.push = null;
    send(room.connIds(), { type: "room.mode", mode: "build", message: "Push mode timed out. Building continues." });
    log({ event: "push.lock.cleared", workId: room.workId, reason: "idle" });
  }
};

// ---------------------------------------------------------------- scheduler

/** Rolling scheduler-pass cost, for /readyz and capacity measurements. */
const passCost: number[] = [];

const tickStats = () => {
  const xs = [...passCost].sort((a, b) => a - b);
  const q = (p: number): number => (xs.length ? r4(xs[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1)))]!) : 0);
  const live = [...rooms.values()].reduce((n, r) => n + r.overloads, 0);
  return { passes: xs.length, p50Ms: q(0.5), p95Ms: q(0.95), maxMs: q(1), overloadEvents: overloadEvents + live };
};

const tick = (): void => {
  const t = performance.now();
  for (const room of [...rooms.values()]) {
    const wasStable = room.stable;
    room.advance(t, send, (reason) => persistRoom(room, reason));
    if (!wasStable && room.stable) resolvePendingSaves(room);
    pushTimers(room);
    if (room.conns.size === 0 && room.emptySince != null) {
      const empty = now() - room.emptySince;
      // Stable worlds aren't stepped, so keeping one briefly costs no physics;
      // a moving one gets the 10 s settle budget, then suspends with its
      // velocities saved (SAVE-09).
      if ((room.stable && empty >= TRANSPORT.emptyRoomIdleMs) || (!room.stable && empty >= TRANSPORT.emptyRoomSettleMs) || room.paused) {
        unload(room, room.stable ? "empty-settled" : "empty-timeout");
      }
    }
  }
};
setInterval(() => {
  const t0 = performance.now();
  tick();
  passCost.push(performance.now() - t0);
  if (passCost.length > 1200) passCost.splice(0, passCost.length - 1200);
}, 1000 / 60);

setInterval(() => {
  const t = now();
  for (const conn of [...conns.values()]) {
    if (t - conn.lastHeartbeat > TRANSPORT.heartbeatStaleMs) {
      leaveRoom(conn, "heartbeat-timeout");
      conns.delete(conn.connId);
      closeConn(conn.connId, 4000, "heartbeat timeout");
    }
  }
}, 1000);

// ---------------------------------------------------------------- WebSocket messages

const sessionValid = (digest: string): boolean => {
  const s = store.q.session.get(digest);
  return !!s && !s.revoked_at && s.expires_at > now() && now() - s.last_seen < AUTH.sessionIdleMs;
};

function onMessage(connId: string, raw: unknown): void {
  const conn = conns.get(connId);
  if (!conn) return;
  const parsed = ClientMessageS.safeParse(raw);
  if (!parsed.success) {
    send([connId], { type: "error", code: "BAD_REQUEST", message: "Malformed message." });
    return;
  }
  const msg: ClientMessage = parsed.data;
  const room = conn.workId ? rooms.get(conn.workId) : undefined;
  try {
    switch (msg.type) {
      case "hello":
        return; // handled on the main thread before forwarding
      case "room.join":
        joinRoom(conn, msg.workId);
        return;
      case "room.leave":
        leaveRoom(conn, "left");
        return;
      case "lease.takeover": {
        if (!room || !conn.role) return;
        const current = room.leases.get(conn.userId);
        if (current && current.connId !== conn.connId) {
          const old = room.conns.get(current.connId);
          if (old) dropLease(room, old, "TAKEN_OVER");
          else room.leases.delete(conn.userId);
        }
        grantLease(room, conn);
        if (!conn.leaseId) throw new AppError("ROOM_FULL", "All editor seats are taken.");
        send([conn.connId], { type: "lease.changed", lease: { leaseId: conn.leaseId } });
        send(room.connIds(), { type: "presence", presence: room.presence() });
        log({ event: "lease.takeover", actorId: conn.userId, workId: room.workId, outcome: "accepted" });
        return;
      }
      case "draft.start":
      case "draft.pose": {
        if (!room || !conn.leaseId || msg.epoch !== room.epoch) return;
        if (msg.seq <= conn.draftSeq && msg.type === "draft.pose") return;
        if (!conn.ephemeral.take().ok) return; // coalesce: drop excess previews
        conn.draftSeq = msg.seq;
        const d = {
          leaseId: conn.leaseId,
          userId: conn.userId,
          displayName: conn.displayName,
          color: room.memberColors.get(conn.userId) ?? 0,
          seq: msg.seq,
          pose: msg.pose as Pose,
        };
        room.drafts.set(conn.leaseId, d);
        send(room.connIds(conn.connId), { type: "draft.pose", ...d });
        if (msg.type === "draft.start") log({ event: "draft.start", actorId: conn.userId, workId: room.workId });
        return;
      }
      case "draft.end": {
        if (!room || !conn.leaseId) return;
        room.drafts.delete(conn.leaseId);
        send(room.connIds(conn.connId), { type: "draft.removed", leaseId: conn.leaseId });
        log({ event: "draft.end", actorId: conn.userId, workId: room.workId });
        return;
      }
      case "command": {
        const result = submitCommand({ userId: conn.userId, connId }, msg);
        if (!delivered.has(result)) deliver({ userId: conn.userId, connId }, result, msg.workId);
        if (result.code === "STALE_VIEW" || result.code === "STALE_WORLD") {
          const r = rooms.get(msg.workId);
          if (r && r.conns.has(connId)) send([connId], r.snapshotFor(conn));
        }
        return;
      }
      case "command.query": {
        send([connId], queryCommand(conn.userId, msg.commandId));
        return;
      }
      case "heartbeat": {
        conn.lastHeartbeat = now();
        if (!sessionValid(conn.sessionDigest)) {
          endAccess(conn, "SESSION_EXPIRED");
          return;
        }
        if (room && conn.workId && !membership(conn.workId, conn.userId)) {
          endAccess(conn, "REMOVED");
          return;
        }
        if (room && conn.leaseId && msg.draft) {
          const existing = room.drafts.get(conn.leaseId);
          if (!existing) {
            const d = { leaseId: conn.leaseId, userId: conn.userId, displayName: conn.displayName, color: room.memberColors.get(conn.userId) ?? 0, seq: msg.draft.seq, pose: msg.draft.pose as Pose };
            room.drafts.set(conn.leaseId, d);
            send(room.connIds(conn.connId), { type: "draft.pose", ...d });
          }
        }
        send([connId], { type: "heartbeat.ok", serverTime: now() });
        return;
      }
      case "telemetry": {
        log({ event: msg.action, source: "client-reported", actorId: conn.userId, workId: conn.workId, detail: msg.detail });
        return;
      }
    }
  } catch (e) {
    send([connId], { type: "error", code: isAppError(e) ? e.code : "INTERNAL", message: isAppError(e) ? e.message : "Something went wrong." });
    if (!isAppError(e)) log({ event: "ws.error", level: "error", actorId: conn.userId, error: String(e) });
  }
}

function queryCommand(userId: string, commandId: string): CommandResultMsg {
  const prior = store.q.receipt.get(userId, commandId);
  if (prior) {
    if (!membership(prior.work_id, userId)) return { type: "command.result", commandId, kind: prior.kind as Command["kind"], outcome: "rejected", code: "NOT_FOUND" };
    return resultFromReceipt(prior);
  }
  for (const room of rooms.values()) {
    const p = room.pendingSaves.get(userId);
    if (p && p.commandId === commandId) return { type: "command.result", commandId, kind: "snapshot.create", outcome: "pending" };
  }
  return { type: "command.result", commandId, kind: "place", outcome: "unknown" };
}

// ---------------------------------------------------------------- RPC methods (main thread → coordinator)

const sessionRow = (digest: string) => {
  const s = store.q.session.get(digest);
  if (!s || s.revoked_at || s.expires_at <= now() || now() - s.last_seen >= AUTH.sessionIdleMs) return null;
  if (now() - s.last_seen > AUTH.lastSeenWriteMs) store.q.touchSession.run(now(), digest);
  const u = store.q.userById.get(s.user_id);
  if (!u) return null;
  return { userId: u.id, handle: u.handle, displayName: u.display_name, csrf: s.csrf };
};

const workSummary = (w: WorkRow & { role?: string }) => ({
  id: w.id,
  title: w.title,
  role: w.role,
  archived: !!w.archived,
  stickCount: w.stick_count,
  stableHeight: w.stable_height,
  bestHeight: w.best_height,
  createdAt: w.created_at,
  updatedAt: w.updated_at,
  live: rooms.has(w.id),
  ...(w.role === "owner" ? lifecycleCounts(w.id) : {}),
});

/** Real numbers for the trash confirmation: never invented presence (SAVE-10). */
const lifecycleCounts = (workId: string): { editorCount: number; publicExhibits: number } => ({
  editorCount: store.db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE work_id = ? AND role = 'editor'").get(workId)!.n,
  publicExhibits: store.db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM exhibits WHERE work_id = ? AND withdrawn_at IS NULL").get(workId)!.n,
});

const exhibitPublic = (e: { id: string; title: string; description: string; framing: string; attribution: string; height: number; published_at: number; work_id?: string }) => ({
  id: e.id,
  title: e.title,
  description: e.description,
  framing: JSON.parse(e.framing),
  attribution: JSON.parse(e.attribution) as string[],
  height: e.height,
  publishedAt: e.published_at,
});

const notifyRemoved = (workId: string, userId: string, reason: "REMOVED" | "LEFT"): void => {
  const room = rooms.get(workId);
  if (!room) return;
  for (const c of [...room.conns.values()]) if (c.userId === userId) endAccess(c, reason);
};

const methods: Record<string, (...args: any[]) => unknown> = {
  health: () => {
    store.db.prepare("SELECT 1").get();
    const m = process.memoryUsage();
    return {
      rooms: rooms.size,
      conns: conns.size,
      sticks: [...rooms.values()].reduce((n, r) => n + r.pw.sticks.size, 0),
      rssMiB: Math.round(m.rss / 1048576),
      workerHeapMiB: Math.round(m.heapUsed / 1048576),
      workerHeapTotalMiB: Math.round(m.heapTotal / 1048576),
      externalMiB: Math.round(m.external / 1048576),
      arrayBuffersMiB: Math.round(m.arrayBuffers / 1048576),
      tick: tickStats(),
    };
  },

  // --- accounts and sessions (hashing happens on the main thread)
  "user.create": (handle: string, name: string, pwHash: string, recoveryDigest: string) => {
    if (store.q.userByHandle.get(handle)) throw new AppError("HANDLE_TAKEN", "That handle is taken.");
    const id = randomUUID();
    durable(() => store.q.insertUser.run(id, handle, name, pwHash, recoveryDigest, now()));
    log({ event: "account.create", actorId: id, actorName: name, outcome: "accepted" });
    return { id };
  },
  "user.byHandle": (handle: string) => {
    const u = store.q.userByHandle.get(handle);
    return u ? { id: u.id, pwHash: u.pw_hash, displayName: u.display_name } : null;
  },
  "session.create": (userId: string, digest: string, csrf: string) => {
    durable(() => store.q.insertSession.run(digest, userId, csrf, now(), now() + AUTH.sessionAbsoluteMs, now()));
    log({ event: "session.login", actorId: userId, actorName: displayName(userId), outcome: "accepted" });
  },
  "session.get": (digest: string) => sessionRow(digest),
  "session.revoke": (digest: string) => {
    const s = store.q.session.get(digest);
    store.q.revokeSession.run(now(), digest);
    for (const c of [...conns.values()]) if (c.sessionDigest === digest) endAccess(c, "LOGGED_OUT");
    if (s) log({ event: "session.logout", actorId: s.user_id, outcome: "accepted" });
  },
  "user.recover": (handle: string, recoveryDigest: string, newHash: string, newRecoveryDigest: string) => {
    const u = store.q.userByHandle.get(handle);
    if (!u || u.recovery_digest !== recoveryDigest) throw new AppError("BAD_CREDENTIALS", "That handle and recovery code don't match.");
    durable(() => {
      store.db.prepare("UPDATE users SET pw_hash = ?, recovery_digest = ? WHERE id = ?").run(newHash, newRecoveryDigest, u.id);
      store.q.revokeUserSessions.run(now(), u.id);
    });
    for (const c of [...conns.values()]) if (c.userId === u.id) endAccess(c, "SESSION_EXPIRED");
    log({ event: "account.recover", actorId: u.id, outcome: "accepted" });
    return { id: u.id };
  },
  "user.rotateRecovery": (userId: string, newRecoveryDigest: string) => {
    durable(() => store.db.prepare("UPDATE users SET recovery_digest = ? WHERE id = ?").run(newRecoveryDigest, userId));
    log({ event: "account.recovery.rotate", actorId: userId, outcome: "accepted" });
  },

  // --- works
  "works.list": (userId: string) => store.q.worksForUser.all(userId).map(workSummary),
  "works.create": (userId: string, title: string) => {
    if (store.q.ownedCount.get(userId)!.n >= LIMITS.ownedWorksPerAccount) {
      throw new AppError("LIMIT", `You own ${LIMITS.ownedWorksPerAccount} works, the current limit. Archived works and works in your trash still count; only deleting a work permanently frees a slot. Nothing is deleted automatically.`);
    }
    const cfg = currentPhysicsConfig();
    const id = randomUUID();
    const pw = PhysicsWorld.create(cfg);
    try {
      const env = makeEnvelope(pw.snapshot(), { ...pw.envelope(), pushTainted: false, moving: false }, cfg);
      durable(() => {
        store.q.insertWork.run(id, userId, title, JSON.stringify(cfg), cfg.physicsConfigVersion, now(), now());
        store.q.insertMember.run(id, userId, "owner", now());
        store.writeState(id, env, now());
      });
    } finally {
      pw.free();
    }
    log({ event: "work.create", actorId: userId, workId: id, outcome: "accepted" });
    return { id };
  },
  "works.get": (userId: string, workId: string) => {
    const { work, role } = requireMember(workId, userId);
    const members = store.q.members.all(workId).map((m) => ({ userId: m.user_id, displayName: m.display_name, role: m.role, joinedAt: m.joined_at }));
    return { ...workSummary({ ...work, role }), ...lifecycleCounts(workId), members, ownerId: work.owner_id };
  },
  "works.rename": (userId: string, workId: string, title: string) => {
    requireOwner(workId, userId);
    durable(() => store.db.prepare("UPDATE works SET title = ?, updated_at = ? WHERE id = ?").run(title, now(), workId));
    const room = rooms.get(workId);
    if (room) {
      room.title = title;
      for (const c of room.conns.values()) send([c.connId], { type: "room.mode", mode: room.mode, message: `Renamed to “${title}”.` });
    }
    log({ event: "work.rename", actorId: userId, workId, outcome: "accepted" });
  },
  "works.archive": (userId: string, workId: string, archived: boolean) => {
    requireOwner(workId, userId);
    const room = rooms.get(workId);
    if (archived && room) {
      if (room.mode === "push-running") throw new AppError("MODE", "Wait for the push to settle before archiving.");
      const viewers = [...room.conns.values()];
      for (const c of viewers) {
        cancelPendingSave(room, c.userId, "cancelled");
        leaveRoom(c, "ARCHIVED");
      }
      unload(room, "archived");
      durable(() => store.db.prepare("UPDATE works SET archived = 1, updated_at = ? WHERE id = ?").run(now(), workId));
      const row = store.q.work.get(workId)!;
      for (const c of viewers) {
        const m = membership(workId, c.userId);
        if (m) send([c.connId], offlineSnapshot(row, m.role, "ARCHIVED"));
      }
    } else {
      durable(() => store.db.prepare("UPDATE works SET archived = ?, updated_at = ? WHERE id = ?").run(archived ? 1 : 0, now(), workId));
    }
    log({ event: archived ? "work.archive" : "work.unarchive", actorId: userId, workId, outcome: "accepted" });
  },
  // --- trash and permanent deletion (owner only; SAVE-10..SAVE-12). Each runs
  // whole inside the coordinator, so no room command or tick interleaves.
  "works.trash": (userId: string, workId: string) => {
    const work = requireOwner(workId, userId, { allowTrashed: true });
    if (work.trashed_at != null) return { trashedAt: work.trashed_at, alreadyTrashed: true };
    const room = rooms.get(workId);
    const t = now();
    let exhibitsWithdrawn = 0;
    let invitesRevoked = 0;
    try {
      durable(() => {
        // Checkpoint the live world (moving or not) in the same transaction as
        // the transition. A paused room's memory isn't trusted; its last
        // durable state already holds every acknowledged placement.
        if (room && !room.paused) room.writeState(store, t);
        exhibitsWithdrawn = store.db.prepare("UPDATE exhibits SET withdrawn_at = ? WHERE work_id = ? AND withdrawn_at IS NULL").run(t, workId).changes;
        invitesRevoked = store.db.prepare("UPDATE invites SET revoked_at = ? WHERE work_id = ? AND revoked_at IS NULL").run(t, workId).changes;
        // A new epoch makes every pre-trash draft and command stale for good.
        store.db.prepare("UPDATE works SET trashed_at = ?, world_epoch = world_epoch + 1, updated_at = ? WHERE id = ?").run(t, t, workId);
      });
    } catch (e) {
      log({ event: "work.trash", level: "error", actorId: userId, workId, outcome: "failed", error: String(e) });
      if (isAppError(e)) throw e;
      throw new AppError("SAVE_FAILED", "The work couldn't be moved to the trash because saving failed. Nothing changed; try again.");
    }
    let notified = 0;
    const tell = (c: Conn): void => {
      notified++;
      send([c.connId], {
        type: "access.ended",
        reason: "TRASHED",
        message: c.userId === userId ? "You moved this work to the trash. Live building has stopped." : "The owner moved this work to the trash. Live building has stopped and your unplaced stick was discarded.",
      });
      leaveRoom(c, "TRASHED");
    };
    if (room) {
      for (const p of [...room.pendingSaves.keys()]) cancelPendingSave(room, p, "cancelled");
      for (const c of [...room.conns.values()]) tell(c);
      room.pw.free();
      overloadEvents += room.overloads;
      rooms.delete(workId);
    }
    for (const c of conns.values()) if (c.workId === workId) tell(c);
    log({ event: "work.trash", actorId: userId, workId, outcome: "accepted", exhibitsWithdrawn, invitesRevoked, notified, wasLive: !!room, moving: room ? room.moving : false });
    return { trashedAt: t, alreadyTrashed: false, exhibitsWithdrawn };
  },
  "works.untrash": (userId: string, workId: string) => {
    const work = requireOwner(workId, userId, { allowTrashed: true });
    if (work.trashed_at == null) return { archived: !!work.archived, alreadyRestored: true };
    // Membership, invites and exhibits are left as they are now: removed or
    // departed editors stay gone, revoked links stay revoked, exhibits stay
    // withdrawn. No room is opened; the next join loads fresh durable state.
    durable(() => store.db.prepare("UPDATE works SET trashed_at = NULL, updated_at = ? WHERE id = ?").run(now(), workId));
    log({ event: "work.untrash", actorId: userId, workId, outcome: "accepted", archived: !!work.archived });
    return { archived: !!work.archived, alreadyRestored: false };
  },
  "works.purge": (userId: string, workId: string, confirmTitle: string) => {
    const tomb = store.db.prepare<[string], { owner_id: string }>("SELECT owner_id FROM work_tombstones WHERE work_id = ?").get(workId);
    if (tomb) {
      if (tomb.owner_id !== userId) throw new AppError("NOT_FOUND", "That work doesn't exist or you don't have access to it.");
      return { alreadyDeleted: true };
    }
    const work = requireOwner(workId, userId, { allowTrashed: true });
    if (work.trashed_at == null) throw new AppError("NOT_TRASHED", "Only a work in the trash can be deleted permanently. Move it to the trash first.");
    if (confirmTitle !== work.title) throw new AppError("TITLE_MISMATCH", "The title you typed doesn't match this work's title exactly.");
    if (rooms.has(workId)) throw new AppError("BUSY", "This work is still closing. Try again in a moment.");
    const count = (sql: string): number => store.db.prepare<[string], { n: number }>(sql).get(workId)!.n;
    const removed = {
      versions: count("SELECT COUNT(*) AS n FROM snapshots WHERE work_id = ?"),
      exhibits: count("SELECT COUNT(*) AS n FROM exhibits WHERE work_id = ?"),
      members: count("SELECT COUNT(*) AS n FROM memberships WHERE work_id = ?"),
    };
    try {
      durable(() => {
        const del = (sql: string): void => void store.db.prepare(sql).run(workId);
        del("DELETE FROM invite_acceptances WHERE invite_id IN (SELECT id FROM invites WHERE work_id = ?)");
        del("DELETE FROM invites WHERE work_id = ?");
        // favorites keep an id-only row and render as "no longer available"
        del("DELETE FROM exhibits WHERE work_id = ?");
        del("DELETE FROM snapshots WHERE work_id = ?");
        del("DELETE FROM command_receipts WHERE work_id = ?");
        del("DELETE FROM previous_work_states WHERE work_id = ?");
        del("DELETE FROM work_states WHERE work_id = ?");
        del("DELETE FROM memberships WHERE work_id = ?");
        del("DELETE FROM works WHERE id = ?");
        store.db.prepare("INSERT INTO work_tombstones (work_id, owner_id, deleted_at) VALUES (?, ?, ?)").run(workId, userId, now());
      });
    } catch (e) {
      log({ event: "work.purge", level: "error", actorId: userId, workId, outcome: "failed", error: String(e) });
      if (isAppError(e)) throw e;
      throw new AppError("SAVE_FAILED", "The work couldn't be deleted because the database write failed. Nothing was removed; it's still in your trash.");
    }
    log({ event: "work.purge", actorId: userId, workId, outcome: "accepted", ...removed });
    return { alreadyDeleted: false };
  },
  // An editor's own view of collaborations the owner has trashed: just enough
  // to recognise and leave one. No scene, versions, members or trash access.
  "works.unavailable": (userId: string) =>
    store.db
      .prepare<[string], { id: string; title: string }>(
        `SELECT w.id, w.title FROM works w JOIN memberships m ON m.work_id = w.id
         WHERE m.user_id = ? AND m.role = 'editor' AND w.trashed_at IS NOT NULL ORDER BY w.trashed_at DESC`,
      )
      .all(userId)
      .map((w) => ({ id: w.id, title: w.title, status: "trashed-by-owner" as const })),
  "works.trashList": (userId: string) =>
    store.db
      .prepare<[string], WorkRow & { editors: number; exhibits: number; versions: number }>(
        `SELECT w.*,
           (SELECT COUNT(*) FROM memberships m WHERE m.work_id = w.id AND m.role = 'editor') AS editors,
           (SELECT COUNT(*) FROM exhibits e WHERE e.work_id = w.id) AS exhibits,
           (SELECT COUNT(*) FROM snapshots s WHERE s.work_id = w.id) AS versions
         FROM works w WHERE w.owner_id = ? AND w.trashed_at IS NOT NULL ORDER BY w.trashed_at DESC`,
      )
      .all(userId)
      .map((w) => ({
        id: w.id,
        title: w.title,
        archived: !!w.archived,
        stickCount: w.stick_count,
        editorCount: w.editors,
        exhibitCount: w.exhibits,
        versionCount: w.versions,
        trashedAt: w.trashed_at,
      })),

  "works.state": (userId: string, workId: string) => {
    const { work, role } = requireMember(workId, userId);
    let room = rooms.get(workId);
    if (!room && !work.archived) {
      try {
        room = activate(workId);
      } catch (e) {
        if (!isAppError(e) || e.code !== "ROOM_LIMIT") throw e;
      }
    }
    if (room) {
      const fake: Conn = { connId: "http", userId, displayName: "", sessionDigest: "", workId, role, leaseId: null, lastHeartbeat: 0, ephemeral: new TokenBucket(1, 1), draftSeq: 0 };
      return { ...room.snapshotFor(fake), presence: room.presence() };
    }
    return offlineSnapshot(work, role, work.archived ? "ARCHIVED" : "ROOM_LIMIT");
  },

  // --- members and invitations
  "invite.create": (userId: string, workId: string, digest: string) => {
    requireOwner(workId, userId);
    const id = randomUUID();
    const expiresAt = now() + LIMITS.inviteDays * 86400_000;
    durable(() => {
      store.db.prepare("UPDATE invites SET revoked_at = ? WHERE work_id = ? AND revoked_at IS NULL").run(now(), workId);
      store.db
        .prepare("INSERT INTO invites (id, work_id, token_digest, issuer_id, created_at, expires_at, max_uses) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, workId, digest, userId, now(), expiresAt, LIMITS.inviteMaxUses);
    });
    log({ event: "invite.create", actorId: userId, workId, inviteId: id, outcome: "accepted" });
    return { id, expiresAt, maxUses: LIMITS.inviteMaxUses };
  },
  "invite.status": (userId: string, workId: string) => {
    requireOwner(workId, userId);
    const inv = store.db
      .prepare<[string], { id: string; created_at: number; expires_at: number; max_uses: number }>(
        "SELECT * FROM invites WHERE work_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1",
      )
      .get(workId);
    if (!inv) return null;
    const used = store.db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM invite_acceptances WHERE invite_id = ?").get(inv.id)!.n;
    return { id: inv.id, createdAt: inv.created_at, expiresAt: inv.expires_at, maxUses: inv.max_uses, used, expired: inv.expires_at <= now() };
  },
  "invite.revoke": (userId: string, workId: string) => {
    requireOwner(workId, userId);
    durable(() => store.db.prepare("UPDATE invites SET revoked_at = ? WHERE work_id = ? AND revoked_at IS NULL").run(now(), workId));
    log({ event: "invite.revoke", actorId: userId, workId, outcome: "accepted" });
  },
  "invite.preview": (digest: string) => {
    const inv = store.db
      .prepare<[string], { id: string; work_id: string; issuer_id: string; expires_at: number; revoked_at: number | null; max_uses: number }>(
        "SELECT * FROM invites WHERE token_digest = ?",
      )
      .get(digest);
    if (!inv || inv.revoked_at || inv.expires_at <= now()) throw new AppError("INVITE_INVALID", "This invitation has expired or been replaced. Ask the owner for a new link.");
    const work = store.q.work.get(inv.work_id)!;
    return { workTitle: work.title, inviterName: displayName(inv.issuer_id), expiresAt: inv.expires_at };
  },
  "invite.accept": (userId: string, digest: string) => {
    const inv = store.db
      .prepare<[string], { id: string; work_id: string; expires_at: number; revoked_at: number | null; max_uses: number }>(
        "SELECT * FROM invites WHERE token_digest = ?",
      )
      .get(digest);
    if (!inv || inv.revoked_at || inv.expires_at <= now()) throw new AppError("INVITE_INVALID", "This invitation has expired or been replaced. Ask the owner for a new link.");
    const existing = membership(inv.work_id, userId);
    if (existing) return { workId: inv.work_id, alreadyMember: true };
    const already = store.db.prepare("SELECT 1 FROM invite_acceptances WHERE invite_id = ? AND user_id = ?").get(inv.id, userId);
    const used = store.db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM invite_acceptances WHERE invite_id = ?").get(inv.id)!.n;
    if (!already && used >= inv.max_uses) throw new AppError("INVITE_FULL", "This invitation has already been used by its maximum number of people.");
    durable(() => {
      if (!already) store.db.prepare("INSERT INTO invite_acceptances (invite_id, user_id, accepted_at) VALUES (?, ?, ?)").run(inv.id, userId, now());
      store.q.insertMember.run(inv.work_id, userId, "editor", now());
    });
    const room = rooms.get(inv.work_id);
    if (room) refreshNames(room);
    log({ event: "invite.accept", actorId: userId, workId: inv.work_id, inviteId: inv.id, outcome: "accepted" });
    return { workId: inv.work_id, alreadyMember: false };
  },
  "members.remove": (userId: string, workId: string, memberId: string) => {
    requireOwner(workId, userId);
    if (memberId === userId) throw new AppError("BAD_REQUEST", "The owner can't be removed. Archive the work instead.");
    const res = durable(() => store.q.removeMember.run(workId, memberId));
    if (res.changes === 0) throw new AppError("NOT_FOUND", "That person isn't an editor here.");
    notifyRemoved(workId, memberId, "REMOVED");
    log({ event: "member.remove", actorId: userId, workId, memberId, outcome: "accepted" });
  },
  "members.leave": (userId: string, workId: string) => {
    // an editor may still leave while the owner has the work in the trash
    const { role } = requireMember(workId, userId, { allowTrashed: true });
    if (role === "owner") throw new AppError("BAD_REQUEST", "The owner can't leave their own work; archive it instead.");
    durable(() => store.q.removeMember.run(workId, userId));
    notifyRemoved(workId, userId, "LEFT");
    log({ event: "member.leave", actorId: userId, workId, outcome: "accepted" });
  },

  // --- commands (the same handler the WebSocket uses)
  "command.submit": (userId: string, cmd: Command) => {
    const result = submitCommand({ userId }, cmd);
    if (!delivered.has(result)) deliver({ userId }, result, cmd.workId);
    return result;
  },
  "command.query": (userId: string, commandId: string) => queryCommand(userId, commandId),

  // --- versions
  "versions.list": (userId: string, workId: string) => {
    requireMember(workId, userId);
    return store.db
      .prepare<[string], { id: string; kind: string; title: string; height: number; stick_count: number; stable: number; created_at: number; creator_id: string; source_epoch: number; exhibits: number }>(
        `SELECT s.id, s.kind, s.title, s.height, s.stick_count, s.stable, s.created_at, s.creator_id, s.source_epoch,
           (SELECT COUNT(*) FROM exhibits e WHERE e.snapshot_id = s.id) AS exhibits
         FROM snapshots s WHERE s.work_id = ? ORDER BY s.created_at DESC, s.rowid DESC`,
      )
      .all(workId)
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        height: s.height,
        stickCount: s.stick_count,
        stable: !!s.stable,
        createdAt: s.created_at,
        creatorName: displayName(s.creator_id),
        referenced: s.exhibits > 0,
      }));
  },
  "versions.delete": (userId: string, workId: string, snapshotId: string) => {
    requireOwner(workId, userId);
    const s = store.db.prepare<[string, string], { kind: string }>("SELECT kind FROM snapshots WHERE id = ? AND work_id = ?").get(snapshotId, workId);
    if (!s) throw new AppError("NOT_FOUND", "That version doesn't exist.");
    if (s.kind !== "named") throw new AppError("BAD_REQUEST", "Recovery points are managed automatically.");
    if (store.db.prepare("SELECT 1 FROM exhibits WHERE snapshot_id = ?").get(snapshotId)) {
      throw new AppError("REFERENCED", "That version is used by an exhibit, so it can't be removed.");
    }
    durable(() => store.db.prepare("DELETE FROM snapshots WHERE id = ?").run(snapshotId));
    log({ event: "version.delete", actorId: userId, workId, snapshotId, outcome: "accepted" });
  },
  "versions.geometry": (userId: string, workId: string, snapshotId: string) => {
    requireMember(workId, userId);
    const s = store.db.prepare<[string, string], { geometry: string }>("SELECT geometry FROM snapshots WHERE id = ? AND work_id = ?").get(snapshotId, workId);
    if (!s) throw new AppError("NOT_FOUND", "That version doesn't exist.");
    return JSON.parse(s.geometry);
  },

  // --- exhibits
  "exhibits.publish": (userId: string, workId: string, snapshotId: string, title: string, description: string, framing: unknown) => {
    requireOwner(workId, userId);
    const s = store.db
      .prepare<[string, string], { kind: string; stable: number; geometry: string; height: number }>("SELECT kind, stable, geometry, height FROM snapshots WHERE id = ? AND work_id = ?")
      .get(snapshotId, workId);
    if (!s) throw new AppError("NOT_FOUND", "That version doesn't exist.");
    if (s.kind !== "named" || !s.stable) throw new AppError("BAD_REQUEST", "Only settled, named versions can be exhibited. Recovery points can't be published.");
    requireExhibitSlot(workId); // early, readable refusal; rechecked in the transaction
    const geometry = JSON.parse(s.geometry) as { sticks: { authorId: string; p: number[]; q: number[]; seed: number }[]; stick: unknown; table: unknown };
    // Frozen public projection: names at publication, no account IDs (AUTH-05).
    const authors: string[] = [];
    const index = new Map<string, number>();
    for (const st of geometry.sticks) {
      if (!index.has(st.authorId)) {
        index.set(st.authorId, authors.length);
        authors.push(displayName(st.authorId));
      }
    }
    const pub = { v: 1, stick: geometry.stick, table: geometry.table, sticks: geometry.sticks.map((st) => ({ p: st.p, q: st.q, seed: st.seed, a: index.get(st.authorId)! })) };
    const id = randomUUID();
    durable(() => {
      requireExhibitSlot(workId);
      store.db
        .prepare("INSERT INTO exhibits (id, work_id, snapshot_id, title, description, framing, attribution, geometry, height, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, workId, snapshotId, title, description, JSON.stringify(framing), JSON.stringify(authors), JSON.stringify(pub), s.height, now());
    });
    log({ event: "exhibit.publish", actorId: userId, workId, exhibitId: id, snapshotId, outcome: "accepted" });
    return { id };
  },
  "exhibits.setWithdrawn": (userId: string, exhibitId: string, withdrawn: boolean) => {
    const e = store.db.prepare<[string], { work_id: string; withdrawn_at: number | null }>("SELECT work_id, withdrawn_at FROM exhibits WHERE id = ?").get(exhibitId);
    if (!e) throw new AppError("NOT_FOUND", "That exhibit doesn't exist.");
    requireOwner(e.work_id, userId);
    // only withdrawn_at changes: the ID, snapshot and frozen geometry stay as published
    durable(() => store.db.prepare("UPDATE exhibits SET withdrawn_at = ? WHERE id = ?").run(withdrawn ? now() : null, exhibitId));
    log({ event: withdrawn ? "exhibit.withdraw" : "exhibit.republish", actorId: userId, workId: e.work_id, exhibitId, outcome: "accepted" });
  },
  "exhibits.forWork": (userId: string, workId: string) => {
    requireMember(workId, userId);
    return store.db
      .prepare<[string], { id: string; title: string; description: string; framing: string; attribution: string; height: number; published_at: number; withdrawn_at: number | null; snapshot_id: string }>(
        "SELECT * FROM exhibits WHERE work_id = ? ORDER BY published_at DESC",
      )
      .all(workId)
      .map((e) => ({ ...exhibitPublic(e), withdrawn: e.withdrawn_at != null, snapshotId: e.snapshot_id }));
  },
  "exhibits.list": (search: string, offset: number, limit: number) => {
    const like = `%${search.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    const rows = store.db
      .prepare<[string, number, number], { id: string; title: string; description: string; framing: string; attribution: string; height: number; published_at: number }>(
        `SELECT id, title, description, framing, attribution, height, published_at FROM exhibits
         WHERE withdrawn_at IS NULL AND title LIKE ? ESCAPE '\\' ORDER BY published_at DESC, rowid DESC LIMIT ? OFFSET ?`,
      )
      .all(like, limit + 1, offset);
    return { items: rows.slice(0, limit).map(exhibitPublic), more: rows.length > limit };
  },
  "exhibits.get": (exhibitId: string) => {
    const e = store.db
      .prepare<[string], { id: string; title: string; description: string; framing: string; attribution: string; height: number; published_at: number; withdrawn_at: number | null; geometry: string }>(
        "SELECT * FROM exhibits WHERE id = ?",
      )
      .get(exhibitId);
    if (!e) throw new AppError("NOT_FOUND", "That exhibit doesn't exist.");
    if (e.withdrawn_at) throw new AppError("WITHDRAWN", "This exhibit has been withdrawn by its owner.");
    return { ...exhibitPublic(e), geometry: JSON.parse(e.geometry) };
  },

  // --- favorites
  "favorites.list": (userId: string) =>
    store.db
      .prepare<[string], { exhibit_id: string; created_at: number; present: number | null; title: string; withdrawn_at: number | null; height: number; attribution: string }>(
        `SELECT f.exhibit_id, f.created_at, e.rowid AS present, e.title, e.withdrawn_at, e.height, e.attribution FROM favorites f
         LEFT JOIN exhibits e ON e.id = f.exhibit_id WHERE f.user_id = ? ORDER BY f.created_at DESC`,
      )
      .all(userId)
      .map((f) =>
        f.present == null
          ? { exhibitId: f.exhibit_id, withdrawn: true, removed: true, savedAt: f.created_at }
          : f.withdrawn_at
          ? { exhibitId: f.exhibit_id, withdrawn: true, savedAt: f.created_at }
          : { exhibitId: f.exhibit_id, withdrawn: false, savedAt: f.created_at, title: f.title, height: f.height, attribution: JSON.parse(f.attribution) },
      ),
  "favorites.set": (userId: string, exhibitId: string, on: boolean) => {
    if (on) {
      const e = store.db.prepare<[string], { withdrawn_at: number | null }>("SELECT withdrawn_at FROM exhibits WHERE id = ?").get(exhibitId);
      if (!e || e.withdrawn_at) throw new AppError("NOT_FOUND", "That exhibit isn't public.");
      if (store.db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND exhibit_id = ?").get(userId, exhibitId)) return { favorite: true };
      const n = store.db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?").get(userId)!.n;
      if (n >= LIMITS.favoritesPerAccount) throw new AppError("LIMIT", `You have ${LIMITS.favoritesPerAccount} favorites. Remove one to add another.`);
      durable(() => store.db.prepare("INSERT OR IGNORE INTO favorites (user_id, exhibit_id, created_at) VALUES (?, ?, ?)").run(userId, exhibitId, now()));
    } else {
      durable(() => store.db.prepare("DELETE FROM favorites WHERE user_id = ? AND exhibit_id = ?").run(userId, exhibitId));
    }
    log({ event: on ? "favorite.add" : "favorite.remove", actorId: userId, exhibitId, outcome: "accepted" });
    return { favorite: on };
  },
  "favorites.has": (userId: string, exhibitId: string) => !!store.db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND exhibit_id = ?").get(userId, exhibitId),

  // --- WebSocket connections
  "conn.open": (connId: string, userId: string, sessionDigest: string) => {
    conns.set(connId, {
      connId,
      userId,
      displayName: displayName(userId),
      sessionDigest,
      workId: null,
      role: null,
      leaseId: null,
      lastHeartbeat: now(),
      ephemeral: new TokenBucket(TRANSPORT.ephemeralPerSecond, TRANSPORT.ephemeralBurst),
      draftSeq: -1,
    });
    send([connId], { type: "hello.ok", userId });
    log({ event: "ws.connect", actorId: userId, actorName: displayName(userId), connId });
  },
  "conn.message": (connId: string, msg: unknown) => onMessage(connId, msg),
  "conn.close": (connId: string) => {
    const conn = conns.get(connId);
    if (!conn) return;
    leaveRoom(conn, "disconnect");
    conns.delete(connId);
    log({ event: "ws.disconnect", actorId: conn.userId, connId });
  },

  // --- test-only hooks (never enabled in production)
  "test.removeStick": (workId: string, stickId: string) => {
    if (!opts.testHooks) throw new AppError("NOT_FOUND", "Not found");
    const room = activate(workId);
    if (!room.pw.removeStick(stickId)) throw new AppError("NOT_FOUND", "No such stick");
    room.markMoving();
    persistRoom(room, "checkpoint");
    send(room.connIds(), { type: "sticks.removed", streamId: room.streamId, ids: [stickId] });
  },
  "test.failWrites": (on: boolean) => {
    if (!opts.testHooks) throw new AppError("NOT_FOUND", "Not found");
    testState.failWrites = on;
    if (!on) for (const r of rooms.values()) if (r.paused === "SAVE_FAILED") r.paused = null;
  },
  "test.roomInfo": (workId: string) => {
    if (!opts.testHooks) throw new AppError("NOT_FOUND", "Not found");
    const room = rooms.get(workId);
    return room ? { stable: room.stable, mode: room.mode, tick: room.pw.tick, sticks: room.pw.sticks.size, streamId: room.streamId, epoch: room.epoch, paused: room.paused } : null;
  },

  shutdown: () => {
    for (const room of [...rooms.values()]) unload(room, "shutdown");
    store.db.pragma("wal_checkpoint(TRUNCATE)");
    store.db.close();
    log({ event: "coordinator.shutdown" });
  },
};

port.on("message", (m: { kind: "rpc"; id: number; method: string; args: unknown[] }) => {
  const f = methods[m.method];
  try {
    if (!f) throw new AppError("NOT_FOUND", `no method ${m.method}`);
    const result = f(...m.args);
    port.postMessage({ kind: "reply", id: m.id, ok: true, result });
  } catch (e) {
    if (!isAppError(e)) log({ event: "rpc.error", level: "error", method: m.method, error: String(e), stack: (e as Error).stack });
    port.postMessage({
      kind: "reply",
      id: m.id,
      ok: false,
      error: isAppError(e) ? { code: e.code, message: e.message, retryAfterMs: e.retryAfterMs } : { code: "INTERNAL", message: "Internal error" },
    });
  }
});

log({ event: "coordinator.ready", dataDir: opts.dataDir, testHooks: opts.testHooks });
port.postMessage({ kind: "ready" });
