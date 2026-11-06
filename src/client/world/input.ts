// World input mapping (interaction brief §1–§3): which keys do what, and the
// left-drag look gesture with its click/drag threshold. Pure: no DOM, no
// three.js, so the thresholds and mappings are unit-tested directly
// (tests/world-input.test.ts). The stage (WorldStage.tsx) owns the listeners.
import type { SpeedMode } from "../../world/flight.ts";

/** Movement and look keys (KeyboardEvent.code). I/J/K/L look; L stays look-right. */
export const KEYS = Object.freeze({
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  up: ["Space"],
  down: ["KeyC"],
  boost: ["ShiftLeft", "ShiftRight"],
  lookUp: ["KeyI"],
  lookDown: ["KeyK"],
  lookLeft: ["KeyJ"],
  lookRight: ["KeyL"],
  enter: ["KeyE", "Enter"],
});

/** 1 = Walk, 2 = Run, 3 = Fly (top row and numeric keypad). */
export const SPEED_KEYS: Readonly<Record<string, SpeedMode>> = Object.freeze({
  Digit1: "walk",
  Numpad1: "walk",
  Digit2: "run",
  Numpad2: "run",
  Digit3: "fly",
  Numpad3: "fly",
});

/**
 * Look lock toggle. L already looks right (I/J/K/L are kept, as the brief requires), so the toggle is M
 * ("mouse look"), unused by the world and by the browser without modifiers.
 */
export const LOOK_LOCK_KEY = "KeyM";
export const LOOK_LOCK_LABEL = "M";

/** Radians per key press for I/K (pitch) and J/L (yaw). */
export const LOOK_KEY_STEP = { pitch: 0.07, yaw: 0.105 };
/** Radians per CSS pixel: left-drag (and touch drag) look, and Look lock's raw mouse movement. */
export const DRAG_SENSITIVITY = 0.005;
export const LOCK_SENSITIVITY = 0.0022;
/** CSS pixels a left-button press must travel before it turns the camera; less is a click. */
export const DRAG_THRESHOLD = 5;

/**
 * One pointer's look gesture. A press is a click until it has moved more than the threshold from where it
 * started; then it becomes a drag, and the first look applied is only the movement beyond the threshold (no
 * jump). After that every move applies its own delta. end() reports whether the gesture was a drag, so the
 * click that follows a drag can be swallowed.
 */
export class DragLook {
  readonly threshold: number;
  private id: number | null = null;
  private x0 = 0;
  private y0 = 0;
  private lx = 0;
  private ly = 0;
  private dragging = false;

  constructor(threshold = DRAG_THRESHOLD) {
    this.threshold = threshold;
  }

  get active(): boolean {
    return this.id !== null;
  }
  get pointerId(): number | null {
    return this.id;
  }
  get isDragging(): boolean {
    return this.dragging;
  }

  start(pointerId: number, x: number, y: number): void {
    this.id = pointerId;
    this.x0 = this.lx = x;
    this.y0 = this.ly = y;
    this.dragging = false;
  }

  /** The pixel delta to apply as look for this move, or null (another pointer, still a click, no movement). */
  move(pointerId: number, x: number, y: number): [number, number] | null {
    if (this.id === null || pointerId !== this.id) return null;
    if (!this.dragging) {
      const dx = x - this.x0;
      const dy = y - this.y0;
      const d = Math.hypot(dx, dy);
      if (d <= this.threshold) return null;
      this.dragging = true;
      this.lx = x;
      this.ly = y;
      const k = (d - this.threshold) / d; // only the part beyond the threshold
      return [dx * k, dy * k];
    }
    const out: [number, number] = [x - this.lx, y - this.ly];
    this.lx = x;
    this.ly = y;
    return out[0] === 0 && out[1] === 0 ? null : out;
  }

  /** End the gesture (release, cancel, lost capture, blur, leaving the viewport). Returns whether it was a drag. */
  end(pointerId?: number): boolean {
    if (this.id === null || (pointerId !== undefined && pointerId !== this.id)) return false;
    const was = this.dragging;
    this.id = null;
    this.dragging = false;
    return was;
  }
}

/** A text field, a dropdown or editable content: Escape and every other key belong to it, never to the world. */
export const isFormField = (t: EventTarget | null): boolean => {
  const el = t as { isContentEditable?: boolean; tagName?: string } | null;
  if (!el || typeof el !== "object") return false;
  return !!el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName ?? "");
};

/** Held movement keys → the controller's move/vertical/boost input (opposite keys cancel; diagonals normalised later). */
export function heldToInput(held: ReadonlySet<string>): { move: [number, number]; ascend: boolean; descend: boolean; boost: boolean } {
  const any = (keys: readonly string[]): boolean => keys.some((k) => held.has(k));
  return {
    move: [(any(KEYS.right) ? 1 : 0) - (any(KEYS.left) ? 1 : 0), (any(KEYS.forward) ? 1 : 0) - (any(KEYS.back) ? 1 : 0)],
    ascend: any(KEYS.up),
    descend: any(KEYS.down),
    boost: any(KEYS.boost),
  };
}

/** Keys that are held (movement, vertical, boost) rather than pressed once. */
export const HELD_KEYS: ReadonlySet<string> = new Set([...KEYS.forward, ...KEYS.back, ...KEYS.left, ...KEYS.right, ...KEYS.up, ...KEYS.down, ...KEYS.boost]);
