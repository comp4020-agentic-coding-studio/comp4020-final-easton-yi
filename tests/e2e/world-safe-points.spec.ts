// Safe-point recovery against the island's real loaded terrain and collision (final fixes, 2026-11-07).
//
// Some recipe safe points sit above or below the terrain where a pad ends or a river is cut, and two route points
// fall inside the dam's body (docs/10-day-night/10-02-courtyard-report.md, "Found and not fixed"; measured again
// against the runtime terrain decoder for this retest). "Return to nearest safe point" must leave the explorer
// standing on a surface, not hovering in flight and not inside a building. The world data is unchanged: recovery
// lands on the surface under a point and skips a point whose capsule is blocked.
//
// Each case stands next to the problem point, opens the pause menu, chooses "Return to nearest safe point" (the real
// button) and measures the result with the runtime's own collision. Software-rendered; behaviour, not appearance.
import { expect, test, type Page } from "@playwright/test";

type View = {
  manifest: { safePoints: { id: string; feet: number[]; yaw: number }[] };
  jumpTo(t: { feet: number[]; yaw: number }): Promise<boolean>;
  takeControl(o: { pointerLock: boolean }): void;
};

/** Where the explorer stands, the standable surface under that spot, and whether the capsule is clear. */
async function where(page: Page): Promise<{ feet: number[]; ground: number; clear: boolean; flying: boolean }> {
  return page.evaluate(() => {
    type W = { flight: { feet: number[]; flying: boolean }; probeGround(x: number, z: number, y: number): number; probeClear(p: number[]): boolean };
    const v = (window as unknown as { __stillwoodWorld: { view: W } }).__stillwoodWorld.view;
    const f = [...v.flight.feet];
    return { feet: f, ground: v.probeGround(f[0]!, f[2]!, f[1]! + 0.5), clear: v.probeClear([f[0]!, f[1]! + 0.02, f[2]!]), flying: v.flight.flying };
  });
}

// the problem points (ids from the manifest) and where to stand: a metre or two away, so it's the nearest
const CASES = [
  { id: "L06-outside", kind: "above the terrain (≈ 9 m)" },
  { id: "L06-arena", kind: "above the terrain (≈ 3 m)" },
  { id: "L09-keep-top", kind: "above the terrain (≈ 12 m)" },
  { id: "L13-west", kind: "above the terrain (≈ 4 m)" },
  { id: "L16-toe", kind: "above the river cut (≈ 2 m)" },
  { id: "L05-streambed", kind: "below the terrain (≈ 5 m)" },
  { id: "route-1800", kind: "inside the dam's collision" },
  { id: "route-1950", kind: "inside the dam's collision" },
];

test.describe("safe-point recovery on the real terrain", () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 1366, height: 768 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
    await page.goto("/world/");
    await expect(page.getByRole("button", { name: "Start exploring" })).toBeEnabled({ timeout: 60_000 });
  });

  for (const c of CASES) {
    test(`${c.id} (${c.kind}): recovery stands on a surface, clear, not flying`, async ({ page }) => {
      const target = await page.evaluate((id) => {
        const v = (window as unknown as { __stillwoodWorld: { view: View } }).__stillwoodWorld.view;
        return v.manifest.safePoints.find((s) => s.id === id)!;
      }, c.id);
      expect(target, c.id).toBeTruthy();
      // stand 1.5 m from the point (on the surface there), exploring
      await page.evaluate(async (t) => {
        const v = (window as unknown as { __stillwoodWorld: { view: View } }).__stillwoodWorld.view;
        await v.jumpTo({ feet: [t.feet[0]! + 1.5, t.feet[1]!, t.feet[2]!], yaw: t.yaw });
        v.takeControl({ pointerLock: false });
      }, target);
      await expect.poll(async () => page.evaluate(() => (window as unknown as { __stillwoodWorld: { stats(): { control: string } } }).__stillwoodWorld.stats().control)).toBe("exploring");
      // the real pause menu action (desktop: Escape with the world focused pauses)
      await page.locator(".world-stage").focus();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Return to nearest safe point" }).click();
      await expect(page.getByText("Returned to the nearest safe point.")).toBeVisible({ timeout: 60_000 });
      const at = await where(page);
      expect(at.flying, `${c.id}: not left flying`).toBe(false);
      expect(Math.abs(at.feet[1]! - at.ground), `${c.id}: feet ${at.feet[1]!.toFixed(2)} vs surface ${at.ground.toFixed(2)}`).toBeLessThan(0.05);
      expect(at.clear, `${c.id}: the capsule is clear of every collider`).toBe(true);
    });
  }
});
