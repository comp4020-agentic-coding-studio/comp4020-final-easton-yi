// LOOK-04 measurement: does Auto drop under load and come back during
// ordinary use? A browser workshop is slowed with CDP CPU throttling during
// continuous camera motion, then unthrottled and used in short bursts (orbits,
// button presses, view buttons, pauses) while the applied tier is polled.
// Headless Chromium renders with SwiftShader here, so this shows controller
// behaviour, not a device's frame rate. Creates one test account and work.
//   APP_URL=http://localhost:8080 node scripts/measure/graphics-auto.ts
import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL ?? "http://localhost:8080";
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => localStorage.setItem("stillwood.test", "1"));
const p = await ctx.newPage();
const h = `measure_${Date.now().toString(36)}`;
await p.goto(`${BASE}/register/?next=/works/`);
await p.getByLabel("Handle").fill(h);
await p.getByLabel("Display name").fill("Recover");
await p.getByLabel("Password").fill("correct horse battery");
await p.getByRole("button", { name: "Create an account" }).click();
await p.getByLabel("I've stored this code somewhere safe").check();
await p.getByRole("button", { name: "Continue" }).click();
await p.getByLabel("New work name").fill("Recovery work");
await p.getByRole("button", { name: "Create work" }).click();
await p.locator(".conn-open").waitFor();
await p.getByRole("button", { name: "Skip" }).click();
const stats = () => p.evaluate(() => (window as any).__stillwood.stats());
const t0 = Date.now();
const log: string[] = [];
let last = "high";
const note = async (what: string) => { const s = await stats(); if (s.tier !== last) { log.push(`${((Date.now() - t0) / 1000).toFixed(0)} s: ${last} → ${s.tier} (${what})`); last = s.tier; } return s; };
const box = (await p.locator(".scene-host").boundingBox())!;
const orbit = async (ms: number) => {
  await p.mouse.move(box.x + 80, box.y + box.height - 150);
  await p.mouse.down();
  const end = Date.now() + ms;
  for (let i = 0; Date.now() < end; i++) { await p.mouse.move(box.x + 80 + (i % 60) * 4, box.y + box.height - 150 + (i % 7), { steps: 1 }); await p.waitForTimeout(25); }
  await p.mouse.up();
};
const cdp = await ctx.newCDPSession(p);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 60 });
for (let i = 0; i < 6 && (await note("throttled orbit")).tier !== "low"; i++) await orbit(4000);
await p.waitForTimeout(2000);
await note("throttled");
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
const recoverStart = Date.now();
log.push(`${((recoverStart - t0) / 1000).toFixed(0)} s: throttling removed at ${last}`);
let cycles = 0;
while (Date.now() - recoverStart < 300_000 && last !== "high") {
  await orbit(1200); await note("orbit");
  await p.waitForTimeout(2500);
  await p.getByRole("button", { name: "Add a stick" }).click();
  for (let i = 0; i < 3; i++) { await p.getByRole("button", { name: "Left / right (X) increase" }).click(); await p.waitForTimeout(300); }
  await p.getByRole("button", { name: "Cancel" }).click(); await note("buttons");
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: cycles % 2 ? "Default" : "Side" }).click(); await p.waitForTimeout(600); await note("view button");
  await p.waitForTimeout(3000);
  cycles++;
}
const s = await stats();
log.push(`ordinary-use cycles: ${cycles}, final ${s.tier}, failed upgrades ${s.auto.failedUpgrades}, renders ${s.renders}`);
// then keep using it for 2 more minutes to see whether it oscillates
const holdStart = Date.now();
while (Date.now() - holdStart < 120_000) { await orbit(1200); await note("hold orbit"); await p.waitForTimeout(3000); }
log.push(`after 2 more minutes: ${(await stats()).tier}`);
console.log(log.join("\n"));
await b.close();
