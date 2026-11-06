// The island world in a page (main prompt §3, §5.2, §11; interaction brief
// 2026-11-05). The canvas sits in its own region; every control is a DOM
// element with a text label and works by mouse, keyboard and touch. Nothing
// here duplicates business logic: the portals navigate to the app's existing
// pages through ExistingFeatureBridge.
//
// Interaction model (one owner for each state, all cleanup through endInput):
//   presentation   embedded | fullscreen        (the stage element itself is fullscreened: no second renderer)
//   cursor         free cursor | Look lock      (WorldView: pointer lock only on a deliberate action)
//   control        exploring | paused/idle/…    (WorldView.status.control)
//   input focus    the stage's own focus target, vs. the page and its form controls
//   speed          Walk | Run | Fly             (remembered per browser)
// Ordinary mouse movement never turns the camera; a left-button drag on the
// canvas does, after a 5 px threshold. The wheel always scrolls the page.
import { useEffect, useRef, useState } from "react";
import { webglAvailable } from "../scene/viewport.ts";
import { WorldView, type WorldStatus } from "./WorldView.ts";
import { portalTarget, type PortalId } from "./bridge.ts";
import { navigate, navigationKind } from "../router.ts";
import { useSession } from "../session.ts";
import { horizontalSpeed, SPEED_MODES, type SpeedMode } from "../../world/flight.ts";
import { DRAG_SENSITIVITY, DragLook, HELD_KEYS, KEYS, LOCK_SENSITIVITY, LOOK_KEY_STEP, LOOK_LOCK_KEY, LOOK_LOCK_LABEL, SPEED_KEYS, heldToInput, isFormField } from "./input.ts";
import { loadReturn, loadSpeed, saveReturn, saveSpeed, type WorldRoute } from "./world-session.ts";

export const OPENING = "From the first lintel to towers above the clouds. Follow the valley and discover how imagination becomes space, one piece at a time.";

const SPEED_LABEL: Record<SpeedMode, string> = { walk: "Walk", run: "Run", fly: "Fly" };
const SPEED_KEY: Record<SpeedMode, string> = { walk: "1", run: "2", fly: "3" };

/** Is this event's target one of the HUD's own controls (never a camera gesture)? */
const isUi = (t: EventTarget | null): boolean => !!(t as Element | null)?.closest?.("a, button, select, input, textarea, label, [role='group'], [role='dialog'], .world-intro, .world-hud-ui");

const fullscreenElement = (): Element | null => document.fullscreenElement ?? (document as unknown as { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ?? null;
const fullscreenSupported = (): boolean => {
  const el = document.documentElement as unknown as { requestFullscreen?: unknown; webkitRequestFullscreen?: unknown };
  return !!(document.fullscreenEnabled ?? (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled) && !!(el.requestFullscreen || el.webkitRequestFullscreen);
};
async function enterFullscreen(el: HTMLElement): Promise<boolean> {
  try {
    const f = el as unknown as { requestFullscreen?: (o?: FullscreenOptions) => Promise<void>; webkitRequestFullscreen?: () => void };
    if (f.requestFullscreen) await f.requestFullscreen({ navigationUI: "hide" });
    else if (f.webkitRequestFullscreen) f.webkitRequestFullscreen();
    else return false;
  } catch {
    return false;
  }
  return fullscreenElement() === el;
}
function exitFullscreen(): void {
  try {
    const d = document as unknown as { exitFullscreen?: () => Promise<void>; webkitExitFullscreen?: () => void };
    if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined);
    else d.webkitExitFullscreen?.();
  } catch {
    // already out
  }
}

export function WorldStage({ mode }: { mode: "home" | "full" }) {
  const { user } = useSession();
  const stage = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<WorldView | null>(null);
  const [gl] = useState(webglAvailable);
  const [status, setStatus] = useState<WorldStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [touch] = useState(() => matchMedia("(pointer: coarse)").matches);
  const [boostLatched, setBoostLatched] = useState(false);
  const [speed, setSpeedState] = useState<SpeedMode>(loadSpeed);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen] = useState(fullscreenSupported);
  /** World keys are live: the stage holds focus (or Look lock is on). False after the page took focus or scrolled. */
  const [active, setActive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const takeRef = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const route: WorldRoute = mode === "home" ? "/" : "/world/";
  /** The explorer started exploring during this visit (leaving afterwards remembers where they were). */
  const explored = useRef(false);
  const held = useRef(new Set<string>());
  const drag = useRef(new DragLook());
  const swallowClick = useRef(false);
  /** When fullscreen last ended (performance.now()): the Esc that ended it doesn't also pause. */
  const fsExitAt = useRef(-Infinity);
  const activeRef = useRef(false);
  activeRef.current = active;

  // ---- one place that stops all input: held keys, drag gesture, look deltas, Look lock
  const endInput = (opts: { releaseLock?: boolean } = {}): void => {
    held.current.clear();
    const v = view.current;
    const d = drag.current;
    if (d.active) {
      const id = d.pointerId;
      d.end();
      try {
        if (id !== null && v?.renderer.domElement.hasPointerCapture(id)) v.renderer.domElement.releasePointerCapture(id);
      } catch {
        // already released
      }
    }
    stage.current?.classList.remove("dragging");
    if (!v) return;
    if (opts.releaseLock !== false && v.getStatus().pointerLocked) v.releaseLookLock();
    else v.suspendInput();
  };
  const endInputRef = useRef(endInput);
  endInputRef.current = endInput;

  const deactivate = (): void => {
    if (!activeRef.current && !held.current.size && !drag.current.active) return;
    endInputRef.current();
    activeRef.current = false;
    setActive(false);
  };
  const deactivateRef = useRef(deactivate);
  deactivateRef.current = deactivate;

  /** Give world controls the keyboard: focus the stage's own target (never a button), without scrolling. */
  const activate = (): void => {
    const el = stage.current;
    if (!el) return;
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    activeRef.current = true; // keys pressed before the next render already count
    setActive(true);
  };

  // the runtime: created once per mount, disposed on unmount (StrictMode double-mounts are cleaned up)
  useEffect(() => {
    if (!gl || !host.current) return;
    let v: WorldView;
    // Return to world: read at mount (after a previous island's unmount has saved its pose). In-app arrivals (the
    // Return link, a header link, Back/Forward) restore the pose left on this same route; a fresh load or a reload
    // starts at home. The record isn't consumed: it always means "where you last were", and leaving after
    // exploring overwrites it.
    const saved = navigationKind() === "initial" ? null : loadReturn();
    const r = saved && saved.route === route ? saved : null;
    try {
      v = new WorldView(host.current, {
        onState: setStatus,
        onPortal: (id) => void enterPortal(id),
        onFault: (m) => setNotice(m),
        startPose: r?.pose ?? null,
        speed: loadSpeed(),
      });
    } catch {
      setStatus({ phase: "error", control: "error", progress: 0, regionId: "home", regionPrompt: "", nearPortal: null, nearLandmark: null, flying: false, boundary: 0, pointerLocked: false, landmarksReady: 0, speed: loadSpeed(), message: "This browser couldn't start the 3D island." });
      return;
    }
    view.current = v;
    if (r) setNotice("Welcome back. Choose Start exploring to carry on from here.");
    try {
      if (localStorage.getItem("stillwood.test") === "1") (window as unknown as Record<string, unknown>).__stillwoodWorld = { stats: () => v.stats(), view: v };
    } catch {
      // storage unavailable: no probe
    }
    return () => {
      endInputRef.current();
      // leaving the page after exploring (a portal, a header link, an exhibit below): remember the pose for
      // Return to world. Only these numbers outlive the page; the renderer is disposed now as before.
      const p = explored.current ? v.pose() : null;
      if (p) saveReturn({ route, pose: p, at: Date.now() });
      v.dispose();
      view.current = null;
      try {
        delete (window as unknown as Record<string, unknown>).__stillwoodWorld;
      } catch {
        // ignore
      }
    };
  }, [gl]);

  /** Remember where the explorer is, for Return to world from the destination page. */
  const rememberPose = (): void => {
    const p = view.current?.pose();
    if (p) saveReturn({ route, pose: p, at: Date.now() });
  };

  const enterPortal = async (id: PortalId): Promise<void> => {
    const v = view.current;
    if (!v || !v.beginPortalTransition()) return; // one crossing, one transition
    endInputRef.current();
    const target = portalTarget(id, !!userRef.current);
    if (target.kind === "explore") {
      // "Explore the World": stay in this runtime and go to the valley's start (the first route safe point)
      const start = v.manifest?.safePoints.find((p) => p.id === "route-0");
      const ok = start ? await v.jumpTo(start) : false;
      v.endPortalTransition();
      if (ok) setNotice("The valley begins here. Follow it east.");
      return;
    }
    rememberPose();
    if (fullscreenElement()) exitFullscreen();
    navigate(target.href);
  };

  const chooseSpeed = (m: SpeedMode): void => {
    setSpeedState(m);
    saveSpeed(m);
    view.current?.setSpeed(m);
  };

  const toggleLookLock = async (): Promise<void> => {
    const v = view.current;
    if (!v) return;
    if (v.getStatus().pointerLocked) {
      v.releaseLookLock();
      return;
    }
    if (v.getStatus().control !== "exploring") return;
    endInputRef.current({ releaseLock: false });
    const ok = await v.requestLookLock();
    if (ok) {
      setActive(true);
      return;
    }
    // browsers refuse a new lock for about a second after Esc released one
    setNotice(
      performance.now() - v.lookUnlockedAt < 1500
        ? "The browser needs a moment after Esc before it locks the cursor again. Try Look lock again shortly."
        : "Look lock isn't available here. Drag with the left mouse button to look around.",
    );
  };

  /** Mouse presses on the HUD's world controls keep keyboard focus on the world (Tab still reaches them). */
  const keepFocus = (e: React.MouseEvent): void => {
    if (activeRef.current) e.preventDefault();
  };

  // ---- keyboard: only while world controls are active, never while typing or in a form control
  useEffect(() => {
    const syncHeld = (): void => {
      const v = view.current;
      if (!v) return;
      const h = heldToInput(held.current);
      v.input.move[0] = h.move[0];
      v.input.move[1] = h.move[1];
      v.input.ascend = h.ascend;
      v.input.descend = h.descend;
      v.input.boost = h.boost;
      v.invalidate();
    };
    const down = (e: KeyboardEvent): void => {
      const v = view.current;
      if (!v || e.defaultPrevented || isFormField(e.target)) return;
      const st = v.getStatus();
      const exploring = st.control === "exploring";
      const locked = st.pointerLocked;
      const inWorld = locked || (activeRef.current && document.activeElement === stage.current);
      if (e.code === "Escape") {
        // under Look lock Esc releases the cursor (the browser does this itself; if the key reaches the page while
        // still locked, release it here too); in fullscreen the browser leaves fullscreen. That Esc must not pause
        // as well, whichever event arrives first, and nothing re-locks.
        if (locked) {
          e.preventDefault();
          endInputRef.current();
          return;
        }
        if (performance.now() - v.lookUnlockedAt < 400) return;
        if (fullscreenElement() || performance.now() - fsExitAt.current < 400) return;
        if (exploring && inWorld) {
          e.preventDefault();
          endInputRef.current();
          v.releaseControl("paused");
          setMenu(true);
        }
        return;
      }
      if (!exploring || !inWorld || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.code;
      let used = true;
      if (HELD_KEYS.has(k)) {
        // a key already held before input was cleared (Esc, scroll, focus loss) only moves again after a fresh press
        if (!e.repeat) held.current.add(k);
        syncHeld();
      } else if (SPEED_KEYS[k]) chooseSpeed(SPEED_KEYS[k]!);
      else if (k === LOOK_LOCK_KEY) {
        if (!e.repeat) void toggleLookLock();
      } else if (KEYS.lookUp.includes(k)) v.input.look[1] += LOOK_KEY_STEP.pitch;
      else if (KEYS.lookDown.includes(k)) v.input.look[1] -= LOOK_KEY_STEP.pitch;
      else if (KEYS.lookLeft.includes(k)) v.input.look[0] += LOOK_KEY_STEP.yaw;
      else if (KEYS.lookRight.includes(k)) v.input.look[0] -= LOOK_KEY_STEP.yaw;
      else if (KEYS.enter.includes(k) && st.nearPortal?.close) void enterPortal(st.nearPortal.id);
      else used = false;
      if (used) {
        e.preventDefault();
        v.invalidate();
      }
    };
    const up = (e: KeyboardEvent): void => {
      if (!held.current.delete(e.code)) return;
      syncHeld();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ---- focus boundary: world keys stop the moment focus leaves the stage (the page, a form, another window)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onFocusIn = (e: FocusEvent): void => {
      const v = view.current;
      if (e.target === el) {
        // the stage itself: reached by Tab, or focused by a click on the island; world keys work while exploring
        if (v?.getStatus().control === "exploring") setActive(true);
        return;
      }
      // the touch controls (stick, Up/Down/Boost) are themselves world input: holding one must not clear it
      if ((e.target as Element | null)?.closest?.(".world-touch")) return;
      // one of the HUD's own controls (by Tab): its keys are its own, the world's stop
      if (!v?.getStatus().pointerLocked) {
        endInputRef.current({ releaseLock: false });
        setActive(false);
      }
    };
    // Focus leaving the stage for the page (a click on the page below, its links or form fields, Tab) returns the
    // page to normal interaction. A click on non-focusable page content blurs the stage too, so this one handler
    // covers clicks outside without a document-level listener. A window blur or hidden tab is WorldView's: it
    // pauses exploring, and the control effect below drops what was held.
    const onFocusOut = (e: FocusEvent): void => {
      const next = e.relatedTarget as Node | null;
      if (next && el.contains(next)) return; // to a HUD control: onFocusIn above handles it
      if (!next && !document.hasFocus()) return; // the window lost focus: WorldView pauses; focus comes back here
      if (view.current?.getStatus().pointerLocked) return; // Look lock: Esc releases first
      deactivateRef.current();
    };
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // ---- page scrolling: the wheel scrolls the page (never prevented); a scroll ends drag and pauses movement input
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = (): void => {
      if (fullscreenElement()) return;
      if (Math.abs(window.scrollY - lastY) < 2) return;
      lastY = window.scrollY;
      deactivateRef.current();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // the world mostly out of view by any route (a layout change, an anchor jump): input stops too (WorldView
    // separately stops rendering once none of it is visible)
    const el = stage.current;
    let io: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries[entries.length - 1];
          if (e && e.intersectionRatio < 0.5 && !fullscreenElement()) deactivateRef.current();
        },
        { threshold: [0, 0.5] },
      );
      io.observe(el);
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
    };
  }, []);

  // ---- pointer: left-drag look on the canvas only; Look lock's raw movement while locked
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const look = (dx: number, dy: number, k: number): void => {
      const v = view.current;
      if (!v) return;
      v.input.look[0] -= dx * k;
      v.input.look[1] -= dy * k;
      v.invalidate();
    };
    const onDown = (e: PointerEvent): void => {
      const v = view.current;
      if (!v || e.target !== v.renderer.domElement) return;
      if (v.getStatus().control !== "exploring") return;
      if (v.getStatus().pointerLocked) return;
      // the left mouse button only (right-click keeps the normal context menu; middle-click keeps autoscroll);
      // any touch or pen contact that reaches the canvas (the stick and buttons stop theirs), one gesture at a time
      if (e.pointerType === "mouse" ? e.button !== 0 : drag.current.active) return;
      activate();
      drag.current.start(e.pointerId, e.clientX, e.clientY);
      try {
        v.renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };
    const onMove = (e: PointerEvent): void => {
      const v = view.current;
      if (!v || v.getStatus().control !== "exploring") return;
      if (v.getStatus().pointerLocked) {
        if (e.pointerType === "mouse" && document.pointerLockElement === v.renderer.domElement) look(e.movementX, e.movementY, LOCK_SENSITIVITY);
        return;
      }
      // a mouse whose left button is no longer down (released outside the window) ends the drag
      if (drag.current.active && e.pointerType === "mouse" && (e.buttons & 1) === 0) {
        endDrag(e.pointerId);
        return;
      }
      const d = drag.current.move(e.pointerId, e.clientX, e.clientY);
      if (!d) return;
      stage.current?.classList.add("dragging");
      look(d[0], d[1], DRAG_SENSITIVITY);
    };
    const endDrag = (pointerId?: number): void => {
      const wasDrag = drag.current.end(pointerId);
      stage.current?.classList.remove("dragging");
      if (wasDrag) {
        // the click that follows a drag must not activate anything in the world
        swallowClick.current = true;
        setTimeout(() => (swallowClick.current = false), 0);
      }
      const v = view.current;
      try {
        if (pointerId !== undefined && v?.renderer.domElement.hasPointerCapture(pointerId)) v.renderer.domElement.releasePointerCapture(pointerId);
      } catch {
        // already released
      }
    };
    const onUp = (e: PointerEvent): void => endDrag(e.pointerId);
    // leaving the world's viewport ends the gesture (pointer capture keeps events coming; check the bounds)
    const onCapturedMove = (e: PointerEvent): void => {
      if (!drag.current.active || e.pointerId !== drag.current.pointerId) return;
      const r = el.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) endDrag(e.pointerId);
    };
    const onClick = (e: MouseEvent): void => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const onContext = (e: MouseEvent): void => {
      // the normal context menu stays; a drag in progress ends rather than continuing under the menu
      if (drag.current.active) endDrag(drag.current.pointerId ?? undefined);
      void e;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointermove", onCapturedMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("lostpointercapture", onUp);
    el.addEventListener("click", onClick, true);
    el.addEventListener("contextmenu", onContext);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointermove", onCapturedMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("lostpointercapture", onUp);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("contextmenu", onContext);
    };
  }, []);

  // ---- fullscreen: the stage element itself (canvas + HUD), entered and left only by the user
  useEffect(() => {
    const onChange = (): void => {
      const on = fullscreenElement() === stage.current && !!stage.current;
      setFullscreen(on);
      // entering or leaving changes the layout under the pointer: nothing held carries across
      endInputRef.current({ releaseLock: false });
      if (!on) {
        fsExitAt.current = performance.now();
        // back to the embedded layout: a usable cursor (Look lock released) and the page as it was
        if (view.current?.getStatus().pointerLocked) view.current.releaseLookLock();
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    // Look lock ended (Esc, the browser, the toggle): keys held under it must not resume on the next key event
    const onLock = (): void => {
      if (!document.pointerLockElement) {
        held.current.clear();
        drag.current.end();
      }
    };
    document.addEventListener("pointerlockchange", onLock);
    const el = stage.current;
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      document.removeEventListener("pointerlockchange", onLock);
      // leaving the page from fullscreen (a portal, Back): never strand the browser in fullscreen on another page
      if (el && fullscreenElement() === el) exitFullscreen();
    };
  }, []);

  useEffect(() => {
    if (view.current) view.current.input.boostLatched = boostLatched;
  }, [boostLatched]);

  // focus follows the overlay: opening the pause menu (Esc or Pause) moves focus to "Resume
  // exploring" — the Pause button that had it is gone — and closing it returns focus to the world
  useEffect(() => {
    if (menu) takeRef.current?.focus({ preventScroll: true });
  }, [menu]);

  // leaving exploring (pause, blur, hidden tab, a jump, a portal) drops everything held; the keys are only
  // live again once exploring resumes, and only while the stage still has focus
  useEffect(() => {
    if (status && status.control !== "exploring") {
      held.current.clear();
      if (drag.current.active) drag.current.end();
      stage.current?.classList.remove("dragging");
    }
  }, [status?.control]);

  const take = (opts: { fullscreen?: boolean } = {}): void => {
    setMenu(false);
    setNotice(null);
    const v = view.current;
    if (!v) return;
    v.takeControl();
    explored.current = true;
    activate();
    if (opts.fullscreen && stage.current && !fullscreenElement()) {
      const el = stage.current;
      void enterFullscreen(el).then((ok) => {
        if (!ok) setNotice("Fullscreen isn't available here. You can explore in this window.");
        // focus may have moved during the transition: keep the keyboard on the world
        if (view.current?.getStatus().control === "exploring") activate();
      });
    }
  };
  const pause = (): void => {
    endInput();
    view.current?.releaseControl("paused");
    setMenu(true);
  };
  const safe = (): void => {
    const v = view.current;
    const sp = v?.nearestSafePoint();
    if (v && sp) void v.jumpTo(sp).then(() => setNotice("Returned to the nearest safe point."));
  };
  const home = (): void => {
    void view.current?.goHome().then(() => setNotice("Back at the home meadow."));
  };
  const toggleFullscreen = (): void => {
    if (fullscreenElement()) {
      exitFullscreen();
      return;
    }
    if (!stage.current) return;
    void enterFullscreen(stage.current).then((ok) => {
      if (!ok) setNotice("Fullscreen isn't available here. You can explore in this window.");
    });
  };

  if (!gl) {
    return (
      <section className={`world-stage world-${mode} world-fallback`} aria-labelledby="world-h">
        <div className="world-flat">
          <h2 id="world-h">The island</h2>
          <p>This browser can't show the 3D island (WebGL is unavailable). Everything else works as usual: browse the exhibition below, open your works, or build together.</p>
          <p className="actions">
            <a className="button" href={user ? "/works/" : "/login/?next=%2Fworks%2F"}>
              My Works
            </a>
            <a className="button" href={user ? "/works/?new=1" : "/register/?next=%2Fworks%2F%3Fnew%3D1"}>
              Build Together
            </a>
          </p>
        </div>
      </section>
    );
  }

  const s = status;
  const exploring = s?.control === "exploring";
  const ready = s?.phase === "ready";
  const locked = !!s?.pointerLocked;
  const helpText = touch
    ? "Left stick moves; drag on the right to look; Up and Down fly; Walk, Run and Fly set the speed."
    : `Drag with the left mouse button to look (or I/J/K/L). WASD or arrows move, Space up, C down, Shift boosts. 1 Walk · 2 Run · 3 Fly. ${LOOK_LOCK_LABEL} or Look lock: look by moving the mouse; Esc gives the cursor back. E enters a portal. Esc pauses when the cursor is free.`;
  return (
    <section
      ref={stage}
      className={`world-stage world-${mode}${exploring ? " exploring" : ""}${active ? " active" : ""}${locked ? " locked" : ""}${fullscreen ? " is-fullscreen" : ""}`}
      aria-labelledby="world-h"
      aria-describedby="world-help"
      // one Tab stop for the world's keys: keyboard users reach it (or return to it from the HUD) like any control
      tabIndex={0}
      onClick={(e) => {
        // clicking empty world space (not a control) while exploring gives the world the keyboard
        if (exploring && !isUi(e.target)) activate();
      }}
    >
      <h2 id="world-h" className="sr-only">
        The island
      </h2>
      <div className="world-host" ref={host} />
      <div className="world-overlay">
        {!exploring && (
          <div className="world-intro">
            <p className="world-opening">{OPENING}</p>
            {s?.phase === "loading" && (
              <p className="world-progress" role="status">
                Loading the island… {Math.round((s.progress ?? 0) * 100)}%
              </p>
            )}
            {(s?.phase === "error" || s?.phase === "context-lost") && (
              <div className="notice error world-error" role="alert">
                <p>{s.message}</p>
                {s.phase === "error" && (
                  <button type="button" onClick={() => view.current?.retry()}>
                    Try again
                  </button>
                )}
                <p className="small">The exhibition, your works and building together don't need the island.</p>
              </div>
            )}
            <div className="world-actions">
              <button ref={takeRef} type="button" className="primary" disabled={!ready} onClick={() => take()}>
                {menu ? "Resume exploring" : "Start exploring"}
              </button>
              {canFullscreen && !fullscreen && (
                <button type="button" disabled={!ready} onClick={() => take({ fullscreen: true })}>
                  Explore fullscreen
                </button>
              )}
              {mode === "home" && (
                <a className="button" href="/world/">
                  Island page
                </a>
              )}
            </div>
            <p id="world-help" className="world-help small">
              {helpText}
            </p>
          </div>
        )}
        <nav className="world-portals" aria-label="Island portals">
          <a href="/world/" onClick={(e) => (e.preventDefault(), void enterPortal("explore"))}>
            Explore the World
          </a>
          <a href={portalTarget("works", !!user).href} onClick={rememberPose}>
            My Works
          </a>
          <a href={portalTarget("together", !!user).href} onClick={rememberPose}>
            Build Together
          </a>
          <a
            href="/#exhibits-h"
            onClick={(e) => {
              if (mode === "home") {
                e.preventDefault();
                if (fullscreenElement()) exitFullscreen();
                document.getElementById("exhibits-h")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
              } else rememberPose();
            }}
          >
            View player works
          </a>
        </nav>
        {exploring && (
          <>
            <div className="world-hud" aria-live="polite">
              {s?.nearPortal && (
                <p className="world-portal-label">
                  {s.nearPortal.label}
                  {s.nearPortal.close && <span className="world-enter"> · press E or walk through</span>}
                </p>
              )}
              {!s?.nearPortal && s?.regionPrompt && <p className="world-region">{s.regionPrompt}</p>}
              {s?.wayPrompt && <p className="world-way">{s.wayPrompt}</p>}
              {s?.nearLandmark && s.nearLandmark.distance < 250 && (
                <p className="world-plaque">
                  {s.nearLandmark.title} · World preset · Inspired by {s.nearLandmark.inspiration}
                </p>
              )}
              {s && s.boundary > 0.05 && <p className="world-wind">The wind pushes back toward the island.</p>}
              {!active && !locked && !touch && <p className="world-inactive">Click the island or drag to look; keys move it while it's selected.</p>}
            </div>
            <div className="world-controls">
              <button ref={menuButton} type="button" onClick={pause}>
                Pause
              </button>
              {!touch && (
                <button type="button" aria-expanded={helpOpen} aria-controls="world-keys" onMouseDown={keepFocus} onClick={() => setHelpOpen(!helpOpen)}>
                  Controls
                </button>
              )}
              {canFullscreen && (
                <button type="button" className="world-fs" onMouseDown={keepFocus} onClick={toggleFullscreen}>
                  {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                </button>
              )}
              {s?.nearPortal?.close && (
                <button type="button" className="primary" onClick={() => void enterPortal(s.nearPortal!.id)}>
                  Enter {s.nearPortal.label}
                </button>
              )}
            </div>
            {helpOpen && !touch && (
              <div id="world-keys" className="world-keys world-hud-ui" role="group" aria-label="Island controls">
                <ul>
                  <li>Look: drag with the left mouse button, or I/J/K/L</li>
                  <li>Move: W A S D or the arrow keys · Space up · C down · Shift boost</li>
                  <li>Speed: 1 Walk · 2 Run · 3 Fly (or the buttons on the right)</li>
                  <li>Look lock ({LOOK_LOCK_LABEL}): look by moving the mouse; Esc gives the cursor back</li>
                  <li>E: enter a portal · Esc: releases Look lock first; in fullscreen it leaves fullscreen; otherwise it pauses</li>
                  <li>Fullscreen: the Fullscreen button; leave with Exit fullscreen or Esc (Pause stays available)</li>
                  <li>The mouse wheel scrolls the page; click the island to use its keys again</li>
                </ul>
              </div>
            )}
            <SpeedRail speed={speed} onSpeed={chooseSpeed} locked={locked} onLookLock={() => void toggleLookLock()} touch={touch} keepFocus={keepFocus} />
            {touch && <TouchControls view={view} boostLatched={boostLatched} setBoostLatched={setBoostLatched} />}
          </>
        )}
        {notice && (
          <p className="world-notice" role="status">
            {notice}
          </p>
        )}
        {menu && !exploring && (
          <div className="world-menu" role="group" aria-label="Paused">
            <button type="button" onClick={safe}>
              Return to nearest safe point
            </button>
            <button type="button" onClick={home}>
              Return home
            </button>
            <LandmarkJump view={view} onJump={(t) => setNotice(`At ${t}. Start exploring to look around.`)} />
            {fullscreen && (
              <button type="button" onClick={exitFullscreen}>
                Exit fullscreen
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Speed presets (top to bottom: Fly, Run, Walk) and Look lock below them, at the world viewport's right centre. */
function SpeedRail({ speed, onSpeed, locked, onLookLock, touch, keepFocus }: { speed: SpeedMode; onSpeed: (m: SpeedMode) => void; locked: boolean; onLookLock: () => void; touch: boolean; keepFocus: (e: React.MouseEvent) => void }) {
  const order = [...SPEED_MODES].reverse(); // fly, run, walk
  return (
    <div className="world-rail world-hud-ui">
      <div className="world-speed" role="group" aria-label="Speed">
        {order.map((m) => (
          <button
            key={m}
            type="button"
            className={`world-speed-btn speed-${m}`}
            aria-pressed={speed === m}
            title={`${SPEED_LABEL[m]} · ${horizontalSpeed(m, false)} m/s · key ${SPEED_KEY[m]}`}
            onClick={() => onSpeed(m)}
            // a press on the rail never starts a camera gesture, and a mouse press doesn't take the world's keys away
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={keepFocus}
          >
            <SpeedIcon mode={m} />
            <span className="world-speed-label">{SPEED_LABEL[m]}</span>
            {!touch && <kbd aria-hidden="true">{SPEED_KEY[m]}</kbd>}
          </button>
        ))}
      </div>
      {!touch && (
        <button type="button" className="world-lock" aria-pressed={locked} title={`Look lock · key ${LOOK_LOCK_LABEL}`} onClick={onLookLock} onPointerDown={(e) => e.stopPropagation()} onMouseDown={keepFocus}>
          <span aria-hidden="true" className="world-lock-icon">
            {locked ? "◉" : "○"}
          </span>
          <span className="world-lock-text">{locked ? "Look locked · Esc to release cursor" : "Free cursor"}</span>
          <span className="sr-only">{locked ? "" : ` · Look lock (${LOOK_LOCK_LABEL})`}</span>
        </button>
      )}
    </div>
  );
}

function SpeedIcon({ mode }: { mode: SpeedMode }) {
  // simple line icons that read on bright sky and dark stone alike (stroke follows the button's text colour)
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (mode === "fly")
    return (
      <svg {...common}>
        <path d="M3 13c3-1 5-4 9-4s6 3 9 4" />
        <path d="M7 12.5 4 17M17 12.5l3 4.5M12 9v8" />
      </svg>
    );
  if (mode === "run")
    return (
      <svg {...common}>
        <circle cx="15" cy="4.5" r="1.8" />
        <path d="M9 20l3-5 3 2v4M12 15l1-5 4 3h3M13 10l-4-1-3 3" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 8v6l-2 6M12 14l2 6M9 11l3-2 3 2" />
    </svg>
  );
}

function LandmarkJump({ view, onJump }: { view: React.RefObject<WorldView | null>; onJump: (title: string) => void }) {
  const m = view.current?.manifest;
  if (!m) return null;
  return (
    <label className="world-jump">
      <span>Go to a landmark</span>
      <select
        defaultValue=""
        onChange={(e) => {
          const l = m.landmarks.find((x) => x.id === e.target.value);
          const vp = l?.viewpoints.find((v) => v.kind === "ground") ?? l?.viewpoints[0];
          if (l && vp && view.current) void view.current.jumpTo({ feet: [vp.eye[0], vp.eye[1] - 1.65, vp.eye[2]], yaw: vp.yaw, pitch: vp.pitch }).then(() => onJump(l.title));
          e.target.value = "";
        }}
      >
        <option value="" disabled>
          Choose…
        </option>
        {m.landmarks.map((l) => (
          <option key={l.id} value={l.id}>
            {l.title} — inspired by {l.inspiration}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Left virtual stick, right-side drag look (handled by the stage), ascend/descend and a boost toggle (44 px targets). */
function TouchControls({ view, boostLatched, setBoostLatched }: { view: React.RefObject<WorldView | null>; boostLatched: boolean; setBoostLatched: (b: boolean) => void }) {
  const stick = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const active = useRef<number | null>(null);
  const setMove = (x: number, y: number): void => {
    const v = view.current;
    if (!v) return;
    v.input.move[0] = x;
    v.input.move[1] = -y;
    v.invalidate();
  };
  const onDown = (e: React.PointerEvent): void => {
    e.stopPropagation();
    active.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onMove(e);
  };
  const onMove = (e: React.PointerEvent): void => {
    if (active.current !== e.pointerId || !stick.current) return;
    const r = stick.current.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    setKnob([x, y]);
    setMove(x, y);
  };
  const onUp = (e: React.PointerEvent): void => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    setKnob([0, 0]);
    setMove(0, 0);
  };
  const hold = (key: "ascend" | "descend") => ({
    // a press doesn't move focus to the button (it's held input, not a form control)
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      if (view.current) view.current.input[key] = true;
      view.current?.invalidate();
    },
    onPointerUp: () => {
      if (view.current) view.current.input[key] = false;
    },
    onPointerCancel: () => {
      if (view.current) view.current.input[key] = false;
    },
    onLostPointerCapture: () => {
      if (view.current) view.current.input[key] = false;
    },
  });
  return (
    <div className="world-touch">
      <div className="world-stick" ref={stick} role="img" aria-label="Move stick" onMouseDown={(e) => e.preventDefault()} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp}>
        <div className="world-knob" style={{ transform: `translate(${knob[0] * 32}px, ${knob[1] * 32}px)` }} />
      </div>
      <div className="world-fly">
        <button type="button" {...hold("ascend")}>
          Up
        </button>
        <button type="button" {...hold("descend")}>
          Down
        </button>
        <button type="button" aria-pressed={boostLatched} onClick={() => setBoostLatched(!boostLatched)}>
          Boost
        </button>
      </div>
    </div>
  );
}
