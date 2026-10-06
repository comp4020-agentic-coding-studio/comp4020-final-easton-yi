// `/works/:id/`: the private workshop. The server owns the world; this page
// renders it, holds at most one local ghost, and submits placements as
// durable commands (PLACE-09, SYNC-02..07).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.ts";
import { navigate, signInLink } from "../router.ts";
import { useSession } from "../session.ts";
import { Viewport, webglAvailable, PERSON_COLORS, PERSON_SHAPES } from "../scene/viewport.ts";
import { knock, unlockAudio, isMuted, setMuted } from "../scene/audio.ts";
import { RoomConnection, type ConnStatus } from "./connection.ts";
import {
  draftPose,
  presetHorizontal,
  presetVertical,
  reorient,
  snapDown,
  spawnDraft,
  validate,
  type Draft,
  type Obstacle,
  type Pivot,
  type Validity,
} from "../placement-math.ts";
import { INPUT, LIMITS, currentPhysicsConfig } from "../../shared/config.ts";
import { stickBox, yawPitchRollFromQuat } from "../../shared/geometry.ts";
import type { CommandKind, CommandResultMsg, PresenceEntry, RemoteDraft, RoomMode, RoomSnapshotMsg, SaveStatus, ServerMessage, StickInfo } from "../../shared/protocol.ts";
import { MembersPanel, VersionsPanel, PushPanel, SettingsPanel } from "./Panels.tsx";
import { Intro } from "./Intro.tsx";
import { AdjustPanel, ViewControls, StickList } from "./Controls.tsx";

const cfg = currentPhysicsConfig();
const DEG = Math.PI / 180;

export type Phase = "idle" | "draft" | "submitting" | "unknown-result" | "needs-review";

export interface RoomView {
  title: string;
  role: "owner" | "editor";
  live: boolean;
  liveReason?: string;
  lease: { leaseId: string } | null;
  leaseReason?: string;
  mode: RoomMode;
  pushOwnerAway?: boolean;
  save: SaveStatus;
  stableHeight: number;
  bestHeight: number;
  measuring: boolean;
  resumedMotion: boolean;
  presence: PresenceEntry[];
  epoch: number;
  streamId: string;
}

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error" | "ok";
}

const uuid = (): string => crypto.randomUUID();

export const validityText = (v: Validity | null, phase: Phase): { icon: string; text: string; tone: "ok" | "warn" | "bad" | "pending" } => {
  if (phase === "submitting") return { icon: "…", text: "Waiting for server", tone: "pending" };
  if (phase === "unknown-result") return { icon: "?", text: "Checking whether this was placed", tone: "pending" };
  if (phase === "needs-review") return { icon: "!", text: "The work was restored. Review this stick before placing", tone: "warn" };
  if (!v) return { icon: "", text: "", tone: "ok" };
  switch (v.kind) {
    case "ready":
      return { icon: "✓", text: v.drop > 0.02 ? `Ready to place · drops ${v.drop.toFixed(2)} u onto the surface below` : "Ready to place", tone: "ok" };
    case "unsupported":
      return { icon: "↓", text: "Unsupported; will fall", tone: "warn" };
    case "intersecting":
      return { icon: "✕", text: v.with === "table" ? "Intersecting the table; adjust position" : "Intersecting; adjust position", tone: "bad" };
    case "out-of-bounds":
      return {
        icon: "✕",
        text:
          v.reason === "below"
            ? "Part of it is below the tabletop; raise it (or turn it around an end)"
            : v.reason === "above"
              ? "Too high; the building area ends at 80 u"
              : "Outside the building area; move it closer to the table",
        tone: "bad",
      };
    case "capacity":
      return { icon: "✕", text: `This work has reached ${LIMITS.sticksPerWork} sticks`, tone: "bad" };
    case "invalid":
      return { icon: "✕", text: "That pose isn't valid", tone: "bad" };
  }
};

export const saveText = (room: RoomView | null): string => {
  if (!room) return "Loading…";
  if (!room.live) {
    if (room.liveReason === "ARCHIVED") return "Archived · read-only";
    return room.save === "suspended" ? "Last saved state (paused mid-motion) · live building hasn't started" : "Last saved state · live building hasn't started";
  }
  switch (room.save) {
    case "saved":
      return "Structure saved";
    case "moving":
      return "Placement saved; structure moving";
    case "saving":
      return "Saving…";
    case "error":
      return "Saving failed · building paused to protect your work";
    case "paused":
      return "Paused";
    case "suspended":
      return "Resuming motion from where it paused";
  }
};

export function Workshop({ workId }: { workId: string }) {
  const { user } = useSession();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewport = useRef<Viewport | null>(null);
  const conn = useRef<RoomConnection | null>(null);
  const [glError, setGlError] = useState<string | null>(() => (webglAvailable() ? null : "This browser can't show 3D (WebGL is unavailable), so building isn't possible here."));
  const [connStatus, setConnStatus] = useState<ConnStatus>("connecting");
  const [room, setRoom] = useState<RoomView | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  const [sticks, setSticks] = useState<StickInfo[]>([]);
  const sticksRef = useRef(new Map<string, StickInfo>());
  const remoteDrafts = useRef(new Map<string, RemoteDraft>());
  const [remoteList, setRemoteList] = useState<RemoteDraft[]>([]);
  const lastTick = useRef(0);
  const [loadError, setLoadError] = useState<{ code: string; message: string } | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [endedReason, setEndedReason] = useState<string | null>(null);

  // placement state machine
  const [phase, setPhaseState] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const setPhase = (p: Phase): void => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const draftEpoch = useRef(0);
  const draftSeq = useRef(0);
  const lastSent = useRef(0);
  const sendTimer = useRef(0);
  const [pivot, setPivot] = useState<Pivot>("center");
  const [fine, setFine] = useState(false);
  const [snapping, setSnappingState] = useState(true);
  const pending = useRef<{ commandId: string; pose: ReturnType<typeof draftPose>; timer: number } | null>(null);
  const [placeMessage, setPlaceMessage] = useState<string | null>(null);
  const [parallelHint, setParallelHint] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [panel, setPanel] = useState<"none" | "members" | "versions" | "push" | "settings" | "sticks">("none");
  const [inputMode, setInputMode] = useState<"observe" | "adjust">("observe");
  const [muted, setMutedState] = useState(isMuted());
  const [introOpen, setIntroOpen] = useState(() => new URLSearchParams(location.search).has("intro"));
  const [introProgress, setIntroProgress] = useState<Set<string>>(new Set());
  const [push, setPush] = useState<{ stickId: string; point: [number, number, number]; yaw: number } | null>(null);
  const coarse = useMemo(() => matchMedia("(pointer: coarse)").matches, []);

  const progress = (step: string): void => setIntroProgress((s) => (s.has(step) ? s : new Set(s).add(step)));

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 4500);
  }, []);

  const obstacles = (): Obstacle[] =>
    (viewport.current?.allPoses() ?? []).map((s) => ({ id: s.id, box: stickBox({ p: s.p, q: s.q }, cfg.stick) }));

  const [validity, setValidity] = useState<Validity | null>(null);
  const revalidate = useCallback((d: Draft | null) => {
    if (!d) return setValidity(null);
    setValidity(validate(d, cfg.stick, obstacles(), cfg.table, cfg.placementBounds, cfg.penetrationTolerance, sticksRef.current.size >= LIMITS.sticksPerWork));
  }, []);

  const canEdit = !!room?.live && !!room.lease && room.mode === "build" && connStatus === "open" && !ended;

  const sendDraft = (d: Draft, kind: "draft.start" | "draft.pose", force = false): void => {
    const now = performance.now();
    const due = 1000 / 15; // preview poses ≤ 15 Hz while dragging
    clearTimeout(sendTimer.current);
    if (!force && now - lastSent.current < due) {
      sendTimer.current = window.setTimeout(() => sendDraft(draftRef.current ?? d, "draft.pose", true), due);
      return;
    }
    lastSent.current = now;
    const r = roomRef.current;
    if (!r?.lease) return;
    conn.current?.send({ type: kind, seq: ++draftSeq.current, epoch: r.epoch, pose: draftPose(d) });
  };

  const setDraft = (d: Draft | null, opts: { send?: "start" | "pose" | "final" | "none" } = {}): void => {
    draftRef.current = d;
    setDraftState(d);
    revalidate(d);
    if (d && opts.send && opts.send !== "none") sendDraft(d, opts.send === "start" ? "draft.start" : "draft.pose", opts.send !== "pose");
  };

  // keep the viewport ghost in sync with state
  useEffect(() => {
    const v = viewport.current;
    if (!v) return;
    const t = validityText(validity, phase);
    v.setDraft(draft, { editable: canEdit && (phase === "draft" || phase === "needs-review"), status: t.tone });
  }, [draft, validity, phase, canEdit]);

  // ------------------------------------------------------------ server messages

  const applySnapshot = (s: RoomSnapshotMsg): void => {
    const prev = roomRef.current;
    const next: RoomView = {
      title: s.title,
      role: s.role,
      live: s.live,
      liveReason: s.liveReason,
      lease: s.lease,
      leaseReason: s.leaseReason,
      mode: s.mode,
      pushOwnerAway: s.pushOwnerAway,
      save: s.save,
      stableHeight: s.stableHeight,
      bestHeight: s.bestHeight,
      measuring: s.measuring,
      resumedMotion: s.resumedMotion,
      presence: s.presence,
      epoch: s.epoch,
      streamId: s.streamId,
    };
    roomRef.current = next;
    setRoom(next);
    lastTick.current = s.tick;
    sticksRef.current = new Map(s.sticks.map((x) => [x.id, x]));
    setSticks(s.sticks);
    viewport.current?.setBodies(s.bodies, new Map(s.sticks.map((x) => [x.id, x.seed])));
    remoteDrafts.current = new Map(s.drafts.map((d) => [d.leaseId, d]));
    syncRemote();
    if (!prev) {
      viewport.current?.fitAll(true);
      if (s.resumedMotion) toast("This work paused while moving. Motion is resuming from where it stopped.");
    }
    // a restore (new epoch) makes an old draft need review; never auto-submit
    if (draftRef.current && draftEpoch.current !== s.epoch) {
      if (phaseRef.current === "draft") setPhase("needs-review");
    }
    revalidate(draftRef.current);
    if (draftRef.current && s.lease && (phaseRef.current === "draft" || phaseRef.current === "needs-review")) sendDraft(draftRef.current, "draft.start", true);
    // an outcome we never heard: ask with the original ID
    if (pending.current && s.live) conn.current?.send({ type: "command.query", commandId: pending.current.commandId });
  };

  const syncRemote = (): void => {
    const list = [...remoteDrafts.current.values()];
    viewport.current?.setRemoteDrafts(list.map((d) => ({ leaseId: d.leaseId, displayName: d.displayName, color: d.color, pose: d.pose })));
    setRemoteList(list);
  };

  const onResult = (r: CommandResultMsg): void => {
    if (r.kind === "snapshot.create" || r.kind === "restore" || r.kind.startsWith("push.")) {
      window.dispatchEvent(new CustomEvent("stillwood:command", { detail: r }));
    }
    const p = pending.current;
    if (!p || p.commandId !== r.commandId) return;
    if (r.outcome === "pending") return;
    clearTimeout(p.timer);
    if (r.outcome === "accepted") {
      pending.current = null;
      conn.current?.send({ type: "draft.end", seq: ++draftSeq.current });
      setDraft(null);
      setPhase("idle");
      setPlaceMessage(null);
      progress("place");
      toast("Placed and saved.", "ok");
    } else if (r.outcome === "unknown") {
      setPhase("unknown-result");
      setPlaceMessage("The server has no record of this placement. Nothing was added. You can place it again.");
    } else {
      // rejected: keep the draft; a retry is a new intention with a new ID
      pending.current = null;
      setPhase("draft");
      setPlaceMessage(r.message ?? "That placement was refused.");
      revalidate(draftRef.current);
    }
  };

  const onMessage = (m: ServerMessage): void => {
    const r = roomRef.current;
    switch (m.type) {
      case "room.snapshot":
        if (m.workId === workId) applySnapshot(m);
        return;
      case "presence":
        if (r) {
          const next = { ...r, presence: m.presence };
          roomRef.current = next;
          setRoom(next);
        }
        return;
      case "draft.pose":
        remoteDrafts.current.set(m.leaseId, m);
        syncRemote();
        return;
      case "draft.removed":
        remoteDrafts.current.delete(m.leaseId);
        syncRemote();
        return;
      case "world.frame":
        if (!r || m.streamId !== r.streamId || m.epoch !== r.epoch) return; // obsolete stream: discard
        lastTick.current = Math.max(lastTick.current, m.tick);
        if (m.bodies.length) viewport.current?.pushFrame(m.bodies);
        for (const e of m.events) knock(e.id, e.strength);
        if (draftRef.current) revalidate(draftRef.current);
        return;
      case "sticks.added": {
        if (!r || m.streamId !== r.streamId) return;
        for (const s of m.sticks) sticksRef.current.set(s.id, s);
        setSticks([...sticksRef.current.values()]);
        viewport.current?.addBodies(m.bodies, new Map(m.sticks.map((x) => [x.id, x.seed])));
        revalidate(draftRef.current);
        return;
      }
      case "sticks.removed":
        for (const id of m.ids) sticksRef.current.delete(id);
        setSticks([...sticksRef.current.values()]);
        viewport.current?.removeBodies(m.ids);
        return;
      case "command.result":
        onResult(m);
        return;
      case "save.status":
        if (r) {
          const next = { ...r, save: m.save, stableHeight: m.stableHeight, bestHeight: m.bestHeight, measuring: m.measuring, resumedMotion: false };
          roomRef.current = next;
          setRoom(next);
          if (m.save === "saved") progress("saved");
        }
        return;
      case "lease.changed":
        if (r) {
          const next = { ...r, lease: m.lease, leaseReason: m.lease ? undefined : m.reason === "TAKEN_OVER" ? "OTHER_WINDOW" : r.leaseReason };
          roomRef.current = next;
          setRoom(next);
          if (!m.lease && m.reason === "TAKEN_OVER") toast("Editing moved to another window. This one can still look around.");
          if (!m.lease && pending.current) setPhase("unknown-result");
        }
        return;
      case "room.mode":
        if (r) {
          const next = { ...r, mode: m.mode, pushOwnerAway: m.pushOwnerAway };
          roomRef.current = next;
          setRoom(next);
        }
        if (m.message) toast(m.message);
        if (m.mode === "build") setPush(null);
        return;
      case "room.reset":
        toast("The owner restored a saved version. Everyone now sees the restored structure.");
        return;
      case "access.ended": {
        const why =
          m.message ??
          { LOGGED_OUT: "You signed out.", SESSION_EXPIRED: "Your session ended. Sign in again to keep building.", REMOVED: "The owner removed you from this work.", LEFT: "You left this work.", ARCHIVED: "This work was archived.", TRASHED: "This work was moved to the trash." }[m.reason];
        if (m.reason === "ARCHIVED") {
          toast(why);
          return;
        }
        if (m.reason === "TRASHED" && !roomRef.current) {
          // opened while already in the trash: there's no workshop to show
          setLoadError({ code: "TRASHED", message: why });
          conn.current?.close();
          return;
        }
        if (m.reason === "TRASHED") {
          // the work is gone from ordinary use: drop the local draft and any unresolved submission
          viewport.current?.cancelDrag();
          if (pending.current) clearTimeout(pending.current.timer);
          pending.current = null;
          setDraft(null);
          setPhase("idle");
          setPlaceMessage(null);
          setPanel("none");
          if (roomRef.current) {
            const next = { ...roomRef.current, presence: [], lease: null };
            roomRef.current = next;
            setRoom(next);
          }
        }
        setEnded(why);
        setEndedReason(m.reason);
        remoteDrafts.current.clear();
        syncRemote();
        if (m.reason !== "LOGGED_OUT") {
          viewport.current?.setBodies([], new Map());
          setSticks([]);
        }
        conn.current?.close();
        return;
      }
      case "error":
        if (m.code === "NOT_FOUND") setLoadError({ code: m.code, message: m.message });
        else if (m.code === "STALE_VIEW") toast(m.message);
        else toast(m.message, "error");
        return;
      case "heartbeat.ok":
      case "hello.ok":
        return;
    }
  };
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // ------------------------------------------------------------ lifecycle

  useEffect(() => {
    if (!user || glError) return;
    let v: Viewport;
    try {
      v = new Viewport(hostRef.current!, {
        dims: cfg.stick,
        table: cfg.table,
        mode: "workshop",
        onDraftChange: (d, phaseName) => {
          if (phaseRef.current !== "draft" && phaseRef.current !== "needs-review") return;
          draftRef.current = d;
          if (phaseName === "move") {
            setDraftState(d);
            revalidate(d);
            sendDraft(d, "draft.pose");
          } else if (phaseName === "end") {
            setDraft(d, { send: "final" });
            progress("adjust");
            conn.current?.send({ type: "telemetry", action: "draft.adjust.end" });
          }
        },
        onSelect: (id, point) => {
          setSelected(id);
          if (id && roomRef.current?.mode === "push-selecting" && roomRef.current.role === "owner" && point) {
            const cam = v.camera.position;
            setPush({ stickId: id, point, yaw: Math.atan2(point[2] - cam.z, point[0] - cam.x) });
          }
        },
        onCameraGestureEnd: () => {
          progress("orbit");
          conn.current?.send({ type: "telemetry", action: "camera.gesture.end" });
        },
        onParallelFallback: setParallelHint,
      });
    } catch (e) {
      setGlError(`3D couldn't start in this browser (${(e as Error).message}). Building isn't possible here.`);
      return;
    }
    viewport.current = v;
    // Read-only probe for browser tests (CAM-01): opt-in per browser, never shown in the UI.
    try {
      if (localStorage.getItem("stillwood.test") === "1") (window as unknown as Record<string, unknown>).__stillwood = { framing: () => v.currentFraming(), sticks: () => v.allPoses().length, poses: () => v.allPoses(), rendered: () => v.renderedPositions(), stats: () => v.stats() };
    } catch {
      // storage unavailable: no probe
    }
    const c = new RoomConnection(workId, (m) => onMessageRef.current(m), setConnStatus);
    c.draftPresence = () => (draftRef.current && roomRef.current?.lease ? { seq: draftSeq.current, pose: draftPose(draftRef.current) } : null);
    conn.current = c;
    const onLogout = (): void => c.close();
    window.addEventListener("stillwood:logout", onLogout);
    return () => {
      window.removeEventListener("stillwood:logout", onLogout);
      c.close();
      v.dispose();
      viewport.current = null;
      conn.current = null;
    };
  }, [workId, user, glError]);

  // Without WebGL, still show readable work information (ACCESS-03)
  const [fallback, setFallback] = useState<RoomSnapshotMsg | null>(null);
  useEffect(() => {
    if (!glError || !user) return;
    api<RoomSnapshotMsg>("GET", `/api/works/${workId}/state`).then(setFallback).catch((e) => setLoadError({ code: e.code, message: e.message }));
  }, [glError, user, workId]);

  useEffect(() => {
    viewport.current?.setInputMode(inputMode);
  }, [inputMode]);
  useEffect(() => {
    if (viewport.current) viewport.current.snapping = snapping;
  }, [snapping]);
  useEffect(() => {
    viewport.current?.select(selected);
  }, [selected]);
  useEffect(() => {
    const v = viewport.current;
    if (!v) return;
    if (push && room?.mode === "push-selecting") v.setPushArrow(push.point, [Math.cos(push.yaw), 0, Math.sin(push.yaw)]);
    else v.setPushArrow(null, null);
  }, [push, room?.mode]);

  // ------------------------------------------------------------ actions

  const addStick = (): void => {
    unlockAudio();
    if (!canEdit) return;
    if (draftRef.current) {
      viewport.current?.focusDraft();
      return;
    }
    const v = viewport.current!;
    const sel = selected ? v.stickPose(selected) : null;
    const near: [number, number, number] = sel ? sel.p : [v.controls.target.x, 0, v.controls.target.z];
    const cam = v.camera.position;
    const yaw = Math.atan2(-(cam.x - v.controls.target.x), cam.z - v.controls.target.z); // across the view
    const s = spawnDraft(near, yaw, cfg.stick, obstacles(), cfg.table, cfg.placementGap);
    draftEpoch.current = roomRef.current!.epoch;
    setPhase("draft");
    setPlaceMessage(s.legal ? null : "No free spot was found nearby. The stick intersects something; move it before placing.");
    setDraft(s.draft, { send: "start" });
    progress("add");
  };

  const place = (): void => {
    unlockAudio();
    const d = draftRef.current;
    const r = roomRef.current;
    if (!d || !r || phaseRef.current !== "draft" || !canEdit) return;
    const v = validate(d, cfg.stick, obstacles(), cfg.table, cfg.placementBounds, cfg.penetrationTolerance, sticksRef.current.size >= LIMITS.sticksPerWork);
    setValidity(v);
    if (v.kind !== "ready" && v.kind !== "unsupported") {
      setPlaceMessage(validityText(v, "draft").text);
      return;
    }
    const pose = draftPose(d);
    const commandId = uuid();
    const sent = conn.current?.send({
      v: 1,
      type: "command",
      commandId,
      workId,
      worldEpoch: r.epoch,
      streamId: r.streamId,
      lastSeenTick: lastTick.current,
      leaseId: r.lease!.leaseId,
      kind: "place",
      payload: { pose },
    });
    if (!sent) {
      setPlaceMessage("Not connected. Your stick is kept; placing is available once you're back online.");
      return;
    }
    setPhase("submitting");
    setPlaceMessage(null);
    const timer = window.setTimeout(() => {
      if (pending.current?.commandId !== commandId) return;
      setPhase("unknown-result");
      // ask about the original ID instead of resending under a new one
      conn.current?.send({ type: "command.query", commandId });
      void api<CommandResultMsg>("GET", `/api/commands/${commandId}`).then(onResult).catch(() => undefined);
    }, 5000);
    pending.current = { commandId, pose, timer };
  };

  const cancelDraft = (): void => {
    if (phaseRef.current === "submitting" || phaseRef.current === "unknown-result") return; // a submitted stick can't be "cancelled"
    viewport.current?.cancelDrag();
    conn.current?.send({ type: "draft.end", seq: ++draftSeq.current });
    setDraft(null);
    setPhase("idle");
    setPlaceMessage(null);
  };

  const retryUnknown = (): void => {
    const p = pending.current;
    const r = roomRef.current;
    if (!p || !r?.lease) return;
    // unchanged pose: retry with the same ID so it can't be placed twice
    conn.current?.send({ v: 1, type: "command", commandId: p.commandId, workId, worldEpoch: r.epoch, streamId: r.streamId, lastSeenTick: lastTick.current, leaseId: r.lease.leaseId, kind: "place", payload: { pose: p.pose } });
    setPhase("submitting");
    p.timer = window.setTimeout(() => setPhase("unknown-result"), 5000);
  };

  const keepAfterReview = (): void => {
    draftEpoch.current = roomRef.current?.epoch ?? 0;
    pending.current = null;
    setPhase("draft");
    setPlaceMessage(null);
    revalidate(draftRef.current);
  };

  const adjust = (f: (d: Draft) => Draft): void => {
    const d = draftRef.current;
    if (!d || (phaseRef.current !== "draft" && phaseRef.current !== "needs-review")) return;
    setDraft(f(d), { send: "final" });
    progress("adjust");
  };
  const step = fine ? INPUT.translateFine : INPUT.translateStep;
  const aStep = (fine ? INPUT.angleFineDeg : INPUT.angleStepDeg) * DEG;
  const len = cfg.stick.length;
  const actions = {
    move: (dx: number, dz: number) => adjust((d) => ({ ...d, center: [d.center[0] + dx * step, d.center[1], d.center[2] + dz * step] })),
    height: (dy: number) => adjust((d) => ({ ...d, center: [d.center[0], d.center[1] + dy * step, d.center[2]] })),
    yaw: (s: number) => adjust((d) => reorient(d, len, pivot, d.yaw + s * aStep, d.pitch)),
    pitch: (s: number) => adjust((d) => reorient(d, len, pivot, d.yaw, d.pitch + s * aStep)),
    roll: (s: number) => adjust((d) => ({ ...d, roll: d.roll + s * aStep })),
    horizontal: () => adjust((d) => presetHorizontal(d, len, pivot)),
    vertical: () => adjust((d) => presetVertical(d, len, pivot)),
    snap: () => {
      const d = draftRef.current;
      if (!d) return;
      const r = snapDown(d, cfg.stick, obstacles(), cfg.table, cfg.penetrationTolerance, cfg.placementGap);
      if (!r) {
        setPlaceMessage(`Nothing to rest on within ${INPUT.supportSnapMax} u straight below. Lower the stick closer to its support first.`);
        return;
      }
      setPlaceMessage(r.moved > 0.0005 ? `Lowered ${r.moved.toFixed(3)} u onto the support below.` : "Already resting on its support.");
      adjust(() => r.draft);
    },
    setPose: (center: [number, number, number], yawDeg: number, pitchDeg: number, rollDeg: number) =>
      adjust(() => ({ center, yaw: yawDeg * DEG, pitch: Math.max(-90, Math.min(90, pitchDeg)) * DEG, roll: rollDeg * DEG })),
  };

  // Keyboard shortcuts — never inside text inputs (ACCESS-01)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = e.shiftKey ? 0.2 : 1;
      const k = e.key;
      const map: Record<string, () => void> = {
        n: addStick,
        "+": addStick,
        Enter: place,
        Escape: cancelDraft,
        ArrowLeft: () => actions.move(-s, 0),
        ArrowRight: () => actions.move(s, 0),
        ArrowUp: () => actions.move(0, -s),
        ArrowDown: () => actions.move(0, s),
        PageUp: () => actions.height(s),
        PageDown: () => actions.height(-s),
        q: () => actions.yaw(-1),
        e: () => actions.yaw(1),
        r: () => actions.pitch(1),
        f: () => actions.pitch(-1),
        h: actions.horizontal,
        v: actions.vertical,
        g: actions.snap,
      };
      const fn = map[k.length === 1 ? k.toLowerCase() : k];
      if (!fn) return;
      if (k === "Enter" && t.closest("button, a")) return; // let focused controls work normally
      if (!draftRef.current && !["n", "+"].includes(k.toLowerCase())) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sendCommand = (kind: CommandKind, payload: unknown): string | null => {
    const r = roomRef.current;
    if (!r) return null;
    const commandId = uuid();
    const ok = conn.current?.send({ v: 1, type: "command", commandId, workId, worldEpoch: r.epoch, streamId: r.streamId, lastSeenTick: lastTick.current, leaseId: r.lease?.leaseId ?? "", kind, payload });
    return ok ? commandId : null;
  };

  // ------------------------------------------------------------ render

  if (!user) {
    return (
      <main className="page narrow">
        <h1>Sign in to open this work</h1>
        <p>Works are private to their members. Create an account to save and come back.</p>
        <p className="actions">
          <a className="button primary" href={signInLink("login")}>
            Sign in
          </a>
          <a className="button" href={signInLink("register")}>
            Create an account
          </a>
        </p>
      </main>
    );
  }
  if (loadError) {
    return (
      <main className="page narrow">
        <h1>Can't open this work</h1>
        <p>{loadError.message}</p>
        <p>
          <a href="/works/">Back to my works</a>
        </p>
      </main>
    );
  }
  if (glError) {
    return (
      <main className="page narrow">
        <h1>{fallback?.title ?? "Work"}</h1>
        <div className="notice error" role="alert">
          <p>{glError}</p>
          <p>Try a browser or device with WebGL enabled. Your work is safe on the server.</p>
        </div>
        {fallback && (
          <>
            <p>
              {fallback.sticks.length} sticks · stable structure height <span className="num">{fallback.stableHeight.toFixed(1)}</span> u · best{" "}
              <span className="num">{fallback.bestHeight.toFixed(1)}</span> u
            </p>
            <h2>Contributors</h2>
            <ul>
              {[...new Set(fallback.sticks.map((s) => s.authorName))].map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </main>
    );
  }

  const vt = validityText(validity, phase);
  const presence = room?.presence ?? [];
  const isOwner = room?.role === "owner";
  const observeReason = room && !room.lease
    ? room.leaseReason === "OTHER_WINDOW"
      ? "You're editing in another window. This one is observing."
      : room.leaseReason === "ROOM_FULL"
        ? `All ${LIMITS.editorSeatsPerRoom} editor seats are taken, so you're observing.`
        : room.leaseReason === "ARCHIVED"
          ? "This work is archived."
          : room.live
            ? null
            : "Live building hasn't started: all live rooms are busy. This is the last saved state."
    : null;
  const editBlock =
    ended ??
    (connStatus !== "open" ? (connStatus === "reconnecting" ? "Reconnecting… You can look around and adjust your stick, but placing waits until you're back." : "Connecting…") : null) ??
    observeReason ??
    (room && room.mode !== "build" && room.mode !== "archived" ? (room.mode === "push-review" ? "The owner is reviewing a push." : "Placement is paused while the owner pushes the structure.") : null);

  return (
    <main className={`workshop${coarse ? " touch" : ""}`} aria-label="Workshop">
      <div className="ws-top">
        <h1 className="ws-title">{room?.title ?? "…"}</h1>
        <div className="ws-status" role="status" aria-live="polite">
          <span className={`save save-${endedReason === "TRASHED" ? "closed" : (room?.save ?? "loading")}`}>{endedReason === "TRASHED" ? "In the trash" : saveText(room)}</span>
          <span className="height">
            Stable structure height <span className="num">{room ? room.stableHeight.toFixed(1) : "–"}</span> u{room?.measuring && " · Measuring…"}
          </span>
          <span className="best muted">
            best <span className="num">{room ? room.bestHeight.toFixed(1) : "–"}</span> u
          </span>
          <span className={`conn conn-${ended ? "closed" : connStatus}`}>{ended ? "Not connected" : connStatus === "open" ? "Connected" : connStatus === "reconnecting" ? "Reconnecting…" : connStatus === "closed" ? "Disconnected" : "Connecting…"}</span>
        </div>
        <ul className="presence" aria-label="People here">
          {presence.map((p) => (
            <li key={p.userId} style={{ "--person": PERSON_COLORS[p.color % PERSON_COLORS.length] } as React.CSSProperties}>
              <span aria-hidden="true">{PERSON_SHAPES[p.color % PERSON_SHAPES.length]}</span> {p.displayName}
              {p.userId === user.id ? " (you)" : ""}
              <span className="sr-only">{p.editing ? ", editing" : ", observing"}</span>
              {!p.editing && <span className="muted"> · observing</span>}
            </li>
          ))}
        </ul>
        <nav className="ws-tools" aria-label="Work tools">
          <button type="button" onClick={() => setPanel(panel === "sticks" ? "none" : "sticks")} aria-expanded={panel === "sticks"}>
            Sticks
          </button>
          <button type="button" onClick={() => setPanel(panel === "versions" ? "none" : "versions")} aria-expanded={panel === "versions"}>
            Versions
          </button>
          <button type="button" onClick={() => setPanel(panel === "members" ? "none" : "members")} aria-expanded={panel === "members"}>
            People
          </button>
          {isOwner && (
            <button type="button" onClick={() => setPanel(panel === "push" ? "none" : "push")} aria-expanded={panel === "push"}>
              Push
            </button>
          )}
          <button type="button" onClick={() => setPanel(panel === "settings" ? "none" : "settings")} aria-expanded={panel === "settings"}>
            Work
          </button>
          <button
            type="button"
            onClick={() => {
              setIntroOpen(true);
              conn.current?.send({ type: "telemetry", action: "help.open" });
            }}
          >
            Help
          </button>
          <button
            type="button"
            aria-pressed={muted}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
              if (muted) unlockAudio();
            }}
          >
            {muted ? "Sound off" : "Sound on"}
          </button>
        </nav>
      </div>

      <div className="ws-stage">
        <div className="scene-host" ref={hostRef} onPointerDown={() => unlockAudio()} />
        {editBlock && (
          <div className="stage-banner" role="status">
            <p>{editBlock}</p>
            {room?.leaseReason === "OTHER_WINDOW" && !ended && (
              <button type="button" onClick={() => conn.current?.send({ type: "lease.takeover" })}>
                Edit in this window instead
              </button>
            )}
            {ended &&
              (endedReason === "LOGGED_OUT" || endedReason === "SESSION_EXPIRED" ? (
                <a className="button" href={signInLink("login")}>
                  Sign in again
                </a>
              ) : (
                <a className="button" href={endedReason === "TRASHED" && room?.role === "owner" ? "/works/?view=trash" : "/works/"}>
                  {endedReason === "TRASHED" && room?.role === "owner" ? "Go to Trash" : "Back to my works"}
                </a>
              ))}
          </div>
        )}
        {parallelHint && (
          <p className="stage-hint" role="status">
            Viewing almost edge-on, so the stick moves in small steps. The top view gives finer control.
          </p>
        )}
        {coarse && (
          <div className="mode-toggle" role="radiogroup" aria-label="Touch mode">
            <button type="button" role="radio" aria-checked={inputMode === "observe"} onClick={() => setInputMode("observe")}>
              Observe
            </button>
            <button type="button" role="radio" aria-checked={inputMode === "adjust"} onClick={() => setInputMode("adjust")} disabled={!draft}>
              Adjust
            </button>
          </div>
        )}

        <aside className="rail" aria-label="Stick actions">
          <button type="button" className="rail-add" onClick={addStick} disabled={!canEdit || phase !== "idle"} aria-label="Add a stick" title="Add a stick (N)">
            <span aria-hidden="true">+</span>
            <span className="rail-label">Add</span>
          </button>
          {draft && (
            <>
              <button type="button" className="primary rail-place" onClick={place} disabled={!canEdit || phase !== "draft" || vt.tone === "bad"} title="Place (Enter)">
                Place
              </button>
              <button type="button" onClick={cancelDraft} disabled={phase === "submitting" || phase === "unknown-result"} title="Cancel (Esc)">
                Cancel
              </button>
            </>
          )}
        </aside>

        {draft && (
          <div className={`draft-state tone-${vt.tone}`} role="status" aria-live="polite">
            <span className="icon" aria-hidden="true">
              {vt.icon}
            </span>{" "}
            {vt.text}
            {placeMessage && <p className="draft-msg">{placeMessage}</p>}
            {phase === "unknown-result" && (
              <p className="actions">
                <button type="button" onClick={retryUnknown} disabled={connStatus !== "open"}>
                  Check again / place this stick
                </button>
              </p>
            )}
            {phase === "needs-review" && (
              <p className="actions">
                <button type="button" onClick={keepAfterReview}>
                  Keep this stick
                </button>
                <button type="button" onClick={cancelDraft}>
                  Discard it
                </button>
              </p>
            )}
          </div>
        )}

        <ViewControls viewport={viewport} />
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <p key={t.id} className={`toast toast-${t.kind}`}>
              {t.text}
            </p>
          ))}
        </div>
      </div>

      {draft && (
        <AdjustPanel
          draft={draft}
          pivot={pivot}
          setPivot={setPivot}
          fine={fine}
          setFine={setFine}
          snapping={snapping}
          setSnapping={setSnappingState}
          actions={actions}
          disabled={phase !== "draft" && phase !== "needs-review"}
          yawPitchRoll={yawPitchRollFromQuat(draftPose(draft).q, draft.yaw)}
        />
      )}

      {panel !== "none" && room && (
        <section className="side-panel" aria-label="Panel">
          <button type="button" className="close" onClick={() => setPanel("none")} aria-label="Close panel">
            ×
          </button>
          {panel === "sticks" && (
            <StickList
              sticks={sticks}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                viewport.current?.focus(id);
              }}
              remote={remoteList}
            />
          )}
          {panel === "members" && <MembersPanel workId={workId} isOwner={isOwner} me={user.id} presence={presence} toast={toast} />}
          {panel === "versions" && (
            <VersionsPanel workId={workId} room={room} isOwner={isOwner} sendCommand={sendCommand} viewport={viewport} toast={toast} connected={connStatus === "open"} />
          )}
          {panel === "push" && isOwner && (
            <PushPanel room={room} push={push} setPush={setPush} sendCommand={sendCommand} toast={toast} sticks={sticksRef.current} connected={connStatus === "open"} />
          )}
          {panel === "settings" && <SettingsPanel workId={workId} room={room} isOwner={isOwner} toast={toast} onLeft={() => navigate("/works/")} />}
        </section>
      )}

      {introOpen && (
        <Intro
          progress={introProgress}
          onClose={(done) => {
            setIntroOpen(false);
            conn.current?.send({ type: "telemetry", action: done ? "intro.done" : "intro.skip" });
            if (new URLSearchParams(location.search).has("intro")) history.replaceState(null, "", location.pathname);
          }}
        />
      )}
    </main>
  );
}
