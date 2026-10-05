// Versioned wire protocol. Every inbound value is untrusted: numbers must be
// finite and bounded, strings length-limited. Actor identity never comes from
// a payload; it is derived from the authenticated session.
import { z } from "zod";
import { LIMITS } from "./config.ts";

export const ErrorCodes = [
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "NOT_EDITOR",
  "NOT_OWNER",
  "CSRF",
  "ORIGIN",
  "HANDLE_TAKEN",
  "BAD_CREDENTIALS",
  "BUSY",
  "RATE_LIMITED",
  "COLLISION",
  "OUT_OF_BOUNDS",
  "NON_FINITE",
  "CAPACITY",
  "STALE_WORLD",
  "STALE_VIEW",
  "STALE_LEASE",
  "NO_LEASE",
  "ROOM_FULL",
  "ROOM_LIMIT",
  "ROOM_PAUSED",
  "ARCHIVED",
  "MODE",
  "NOT_STABLE",
  "SAVE_FAILED",
  "STORAGE_FULL",
  "LIMIT",
  "IDEMPOTENCY_CONFLICT",
  "REFERENCED",
  "INVITE_INVALID",
  "INVITE_FULL",
  "WITHDRAWN",
  "INCOMPATIBLE",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ErrorCodes)[number];

const finite = (min: number, max: number) => z.number().finite().min(min).max(max);
export const Vec3S = z.tuple([finite(-1e4, 1e4), finite(-1e4, 1e4), finite(-1e4, 1e4)]);
export const QuatS = z.tuple([finite(-1.01, 1.01), finite(-1.01, 1.01), finite(-1.01, 1.01), finite(-1.01, 1.01)]);
export const PoseS = z.object({ p: Vec3S, q: QuatS });
export const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const Handle = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9_]{3,24}$/, "3–24 letters, digits or underscores"));
export const DisplayName = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(LIMITS.displayNameChars));
export const Title = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(LIMITS.titleChars));
export const Description = z.string().max(LIMITS.descriptionChars);
export const FramingS = z.object({
  yaw: finite(-10, 10),
  pitch: finite(-2, 2),
  distance: finite(1, 400),
  targetY: finite(-10, 100),
});

export const PlacePayload = z.object({ pose: PoseS });
export const PushConfirmPayload = z.object({ stickId: Uuid, point: Vec3S, direction: Vec3S });
export const RestorePayload = z.object({ snapshotId: Uuid });
export const SnapshotPayload = z.object({ title: Title, whenSettled: z.boolean().default(false) });

export const CommandKinds = [
  "place",
  "push.prepare",
  "push.confirm",
  "push.cancel",
  "push.keep",
  "restore",
  "snapshot.create",
  "snapshot.cancel",
] as const;
export type CommandKind = (typeof CommandKinds)[number];

export const CommandS = z.object({
  v: z.literal(1),
  type: z.literal("command"),
  commandId: Uuid,
  workId: Uuid,
  worldEpoch: z.number().int().min(0),
  streamId: z.string().max(64),
  lastSeenTick: z.number().int().min(0),
  leaseId: z.string().max(64),
  kind: z.enum(CommandKinds),
  payload: z.unknown(),
});
export type Command = z.infer<typeof CommandS>;

export const ClientMessageS = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), csrf: z.string().max(128) }),
  z.object({ type: z.literal("room.join"), workId: Uuid }),
  z.object({ type: z.literal("room.leave") }),
  z.object({ type: z.literal("lease.takeover") }),
  z.object({ type: z.literal("draft.start"), seq: z.number().int().min(0), epoch: z.number().int(), pose: PoseS }),
  z.object({ type: z.literal("draft.pose"), seq: z.number().int().min(0), epoch: z.number().int(), pose: PoseS }),
  z.object({ type: z.literal("draft.end"), seq: z.number().int().min(0) }),
  CommandS,
  z.object({ type: z.literal("command.query"), commandId: Uuid }),
  z.object({
    type: z.literal("heartbeat"),
    draft: z.object({ seq: z.number().int().min(0), pose: PoseS }).nullable().optional(),
    visible: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("telemetry"),
    action: z.enum(["camera.gesture.end", "draft.adjust.end", "help.open", "intro.skip", "intro.done"]),
    detail: z.string().max(80).optional(),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessageS>;

/** Compact authoritative body: [id, px, py, pz, qx, qy, qz, qw, sleeping]. */
export type WireBody = [string, number, number, number, number, number, number, number, 0 | 1];

export interface StickInfo {
  id: string;
  authorId: string;
  authorName: string;
  seed: number;
  placedAt: number;
}

export interface PresenceEntry {
  userId: string;
  displayName: string;
  role: "owner" | "editor";
  color: number;
  editing: boolean;
  connections: number;
}

export type SaveStatus = "saved" | "moving" | "saving" | "paused" | "error" | "suspended";
export type RoomMode = "build" | "push-selecting" | "push-running" | "push-review" | "archived" | "offline";

export interface RoomSnapshotMsg {
  type: "room.snapshot";
  workId: string;
  title: string;
  role: "owner" | "editor";
  live: boolean;
  liveReason?: ErrorCode;
  streamId: string;
  epoch: number;
  seq: number;
  tick: number;
  serverTime: number;
  lease: { leaseId: string } | null;
  leaseReason?: "OTHER_WINDOW" | "ROOM_FULL" | "ARCHIVED" | "NOT_LIVE";
  mode: RoomMode;
  pushOwnerAway?: boolean;
  bodies: WireBody[];
  sticks: StickInfo[];
  stableHeight: number;
  bestHeight: number;
  measuring: boolean;
  save: SaveStatus;
  resumedMotion: boolean;
  presence: PresenceEntry[];
  drafts: RemoteDraft[];
  config: { stick: { length: number; width: number; height: number }; table: { radius: number; thickness: number; top: number } };
}

export interface RemoteDraft {
  leaseId: string;
  userId: string;
  displayName: string;
  color: number;
  seq: number;
  pose: { p: [number, number, number]; q: [number, number, number, number] };
}

export interface CommandResultMsg {
  type: "command.result";
  commandId: string;
  kind: CommandKind;
  outcome: "accepted" | "rejected" | "pending" | "unknown" | "cancelled" | "interrupted";
  code?: ErrorCode;
  message?: string;
  seq?: number;
  epoch?: number;
  stickId?: string;
  snapshotId?: string;
  retryAfterMs?: number;
}

export type ServerMessage =
  | RoomSnapshotMsg
  | { type: "hello.ok"; userId: string }
  | { type: "presence"; presence: PresenceEntry[] }
  | ({ type: "draft.pose" } & RemoteDraft)
  | { type: "draft.removed"; leaseId: string }
  | {
      type: "world.frame";
      streamId: string;
      epoch: number;
      seq: number;
      tick: number;
      serverTime: number;
      bodies: WireBody[];
      events: { id: string; p: [number, number, number]; strength: number }[];
    }
  | { type: "sticks.added"; streamId: string; epoch: number; seq: number; sticks: StickInfo[]; bodies: WireBody[] }
  | { type: "sticks.removed"; streamId: string; ids: string[] }
  | CommandResultMsg
  | { type: "save.status"; save: SaveStatus; stableHeight: number; bestHeight: number; measuring: boolean; savedTick: number }
  | { type: "lease.changed"; lease: { leaseId: string } | null; reason?: string }
  | { type: "room.mode"; mode: RoomMode; actorName?: string; pushOwnerAway?: boolean; message?: string }
  | { type: "room.reset"; reason: "restore" | "recovery" }
  | { type: "access.ended"; reason: "LOGGED_OUT" | "SESSION_EXPIRED" | "REMOVED" | "LEFT" | "ARCHIVED" }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "heartbeat.ok"; serverTime: number };
