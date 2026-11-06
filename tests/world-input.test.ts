// World input mapping and session state (interaction brief §1–§3, §6): the
// left-drag threshold (a click stays a click; the drag begins without a jump),
// key bindings (I/J/K/L look; 1/2/3 speed; M Look lock; no conflicts), form
// fields never feed the world, held-key → movement mapping, and the stored
// speed and Return-to-world records are validated on every read.
import { describe, expect, it } from "vitest";
import { DRAG_THRESHOLD, DragLook, HELD_KEYS, KEYS, LOOK_LOCK_KEY, SPEED_KEYS, heldToInput, isFormField } from "../src/client/world/input.ts";
import { DEFAULT_SPEED, RETURN_KEY, RETURN_TTL_MS, SPEED_KEY, clearReturn, loadReturn, loadSpeed, parsePose, saveReturn, saveSpeed } from "../src/client/world/world-session.ts";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}
const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };

describe("left-drag look gesture", () => {
  it("a press that moves no more than the threshold is a click: no look at all", () => {
    const d = new DragLook();
    expect(d.threshold).toBe(5);
    d.start(1, 100, 100);
    expect(d.move(1, 103, 104)).toBeNull(); // exactly 5 px
    expect(d.move(1, 101, 99)).toBeNull();
    expect(d.end(1)).toBe(false); // not a drag: the click goes through
  });

  it("crossing the threshold applies only the movement beyond it (no initial jump), then every move's own delta", () => {
    const d = new DragLook();
    d.start(1, 100, 100);
    const first = d.move(1, 112, 100)!; // 12 px: 7 beyond the threshold
    expect(first[0]).toBeCloseTo(12 - DRAG_THRESHOLD, 9);
    expect(first[1]).toBeCloseTo(0, 9);
    expect(d.isDragging).toBe(true);
    expect(d.move(1, 115, 98)).toEqual([3, -2]);
    expect(d.move(1, 115, 98)).toBeNull(); // no movement, no look
    expect(d.end(1)).toBe(true); // a drag: the following click is swallowed
    expect(d.active).toBe(false);
  });

  it("diagonal crossing keeps the direction and only the excess length", () => {
    const d = new DragLook();
    d.start(7, 0, 0);
    const v = d.move(7, 6, 8)!; // length 10
    expect(Math.hypot(v[0], v[1])).toBeCloseTo(10 - DRAG_THRESHOLD, 9);
    expect(v[1] / v[0]).toBeCloseTo(8 / 6, 9);
  });

  it("ignores other pointers, and ends on release, cancel or an unconditional end (blur, leaving the viewport)", () => {
    const d = new DragLook();
    d.start(1, 0, 0);
    expect(d.move(2, 50, 50)).toBeNull();
    expect(d.end(2)).toBe(false);
    expect(d.active).toBe(true);
    d.move(1, 20, 0);
    expect(d.end()).toBe(true);
    expect(d.move(1, 40, 0)).toBeNull(); // nothing after the end: no rotation continues
  });
});

describe("key bindings", () => {
  it("keeps WASD/arrows, Space/C, Shift and I/J/K/L look", () => {
    expect(KEYS.forward).toEqual(["KeyW", "ArrowUp"]);
    expect(KEYS.lookUp).toEqual(["KeyI"]);
    expect(KEYS.lookLeft).toEqual(["KeyJ"]);
    expect(KEYS.lookDown).toEqual(["KeyK"]);
    expect(KEYS.lookRight).toEqual(["KeyL"]);
    expect(KEYS.up).toEqual(["Space"]);
    expect(KEYS.down).toEqual(["KeyC"]);
  });

  it("1/2/3 select Walk/Run/Fly; Look lock has its own key; no key does two things", () => {
    expect(SPEED_KEYS.Digit1).toBe("walk");
    expect(SPEED_KEYS.Digit2).toBe("run");
    expect(SPEED_KEYS.Digit3).toBe("fly");
    expect(SPEED_KEYS.Numpad3).toBe("fly");
    const all = [...Object.values(KEYS).flat(), ...Object.keys(SPEED_KEYS), LOOK_LOCK_KEY];
    expect(new Set(all).size, "every binding is unique").toBe(all.length);
    expect(LOOK_LOCK_KEY).not.toBe("KeyL");
  });

  it("held keys map to normalisable movement; opposite keys cancel", () => {
    expect(heldToInput(new Set(["KeyW", "KeyD"]))).toEqual({ move: [1, 1], ascend: false, descend: false, boost: false });
    expect(heldToInput(new Set(["KeyW", "KeyS"])).move).toEqual([0, 0]);
    expect(heldToInput(new Set(["ArrowLeft", "Space", "ShiftLeft"]))).toEqual({ move: [-1, 0], ascend: true, descend: false, boost: true });
    expect(heldToInput(new Set()).move).toEqual([0, 0]);
    for (const k of ["KeyI", "KeyJ", "KeyK", "KeyL", "Digit1", LOOK_LOCK_KEY, "KeyE"]) expect(HELD_KEYS.has(k), k).toBe(false);
  });

  it("text fields, dropdowns and editable content never feed the world", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(isFormField({ tagName } as unknown as EventTarget)).toBe(true);
    expect(isFormField({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isFormField({ tagName: "SECTION" } as unknown as EventTarget)).toBe(false);
    expect(isFormField(null)).toBe(false);
  });
});

describe("remembered speed", () => {
  it("defaults to Run on first entry and remembers a valid choice", () => {
    const s = new MemoryStorage();
    expect(DEFAULT_SPEED).toBe("run");
    expect(loadSpeed(s)).toBe("run");
    saveSpeed("fly", s);
    expect(s.getItem(SPEED_KEY)).toBe("fly");
    expect(loadSpeed(s)).toBe("fly");
  });

  it("ignores invalid stored values and blocked storage", () => {
    const s = new MemoryStorage();
    for (const bad of ["sprint", "", "Fly", "{}"]) {
      s.setItem(SPEED_KEY, bad);
      expect(loadSpeed(s), bad).toBe("run");
    }
    saveSpeed("warp" as never, s);
    expect(s.getItem(SPEED_KEY)).toBe("{}");
    expect(loadSpeed(throwing)).toBe("run");
    expect(() => saveSpeed("walk", throwing)).not.toThrow();
    expect(loadSpeed(null)).toBe("run");
  });
});

describe("Return to world record", () => {
  const pose = { feet: [-1105, 128, -275] as [number, number, number], yaw: -1.69, pitch: -0.03 };

  it("round-trips the route and pose", () => {
    const s = new MemoryStorage();
    saveReturn({ route: "/world/", pose, at: 1000 }, s);
    expect(loadReturn(s, 2000)).toEqual({ route: "/world/", pose, at: 1000 });
    saveReturn({ route: "/", pose, at: 1000 }, s);
    expect(loadReturn(s, 2000)?.route).toBe("/");
    clearReturn(s);
    expect(loadReturn(s, 2000)).toBeNull();
  });

  it("rejects malformed, non-finite, out-of-range, unknown-route, stale and future records", () => {
    const s = new MemoryStorage();
    const put = (v: unknown): void => s.setItem(RETURN_KEY, typeof v === "string" ? v : JSON.stringify(v));
    put("not json");
    expect(loadReturn(s, 0)).toBeNull();
    put({ route: "/works/", pose, at: 0 });
    expect(loadReturn(s, 0)).toBeNull();
    put({ route: "/", pose: { ...pose, feet: [0, 0] }, at: 0 });
    expect(loadReturn(s, 0)).toBeNull();
    put({ route: "/", pose: { ...pose, feet: [0, null, 0] }, at: 0 });
    expect(loadReturn(s, 0)).toBeNull();
    put({ route: "/", pose: { ...pose, feet: [1e7, 0, 0] }, at: 0 });
    expect(loadReturn(s, 0)).toBeNull();
    put({ route: "/", pose: { ...pose, pitch: 3 }, at: 0 });
    expect(loadReturn(s, 0)).toBeNull();
    put({ route: "/", pose, at: "yesterday" });
    expect(loadReturn(s, 0)).toBeNull();
    put({ route: "/", pose, at: 0 });
    expect(loadReturn(s, RETURN_TTL_MS + 1)).toBeNull();
    put({ route: "/", pose, at: 10 * 60_000 });
    expect(loadReturn(s, 0)).toBeNull();
    expect(loadReturn(throwing)).toBeNull();
    expect(() => saveReturn({ route: "/", pose, at: 0 }, throwing)).not.toThrow();
  });

  it("never stores an invalid pose", () => {
    const s = new MemoryStorage();
    saveReturn({ route: "/", pose: { feet: [NaN, 0, 0], yaw: 0, pitch: 0 }, at: 0 }, s);
    expect(s.getItem(RETURN_KEY)).toBeNull();
    expect(parsePose({ feet: [1, 2, 3], yaw: 0, pitch: 0 })).toEqual({ feet: [1, 2, 3], yaw: 0, pitch: 0 });
    expect(parsePose(null)).toBeNull();
  });
});
