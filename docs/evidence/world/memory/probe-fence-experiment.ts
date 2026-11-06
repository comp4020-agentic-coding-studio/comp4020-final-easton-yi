// Diagnostic used in the 2026-11-03 memory investigation (docs/evidence/world/memory-incident.md).
// Run from the repo root under the supervisor, with a built dist/ and no other server on 8099:
//   node scripts/world/supervise.ts --stage probe-fence --budget-mib 2048 -- node docs/evidence/world/memory/probe-fence-experiment.ts fence
// Without "fence" it measures the unpaced loop (it was stopped by the cap in the original runs).
// Diagnostic: renderer process Anon vs Shmem (smaps_rollup) while exploring; logs renders and landmark state.
import { spawn, execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { chromium } from "@playwright/test";
const server = spawn(process.execPath, ["dist/server/main.js"], { env: { ...process.env, COOKIE_SECURE: "0", DATA_DIR: "/tmp/sw-probe-data", PORT: "8099", ENABLE_TEST_HOOKS: "1" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const roles = () => {
  const out = {};
  for (const d of readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const cmd = readFileSync(`/proc/${d}/cmdline`, "utf8");
      if (!cmd.includes("chrome-headless-shell")) continue;
      const st = readFileSync(`/proc/${d}/stat`, "utf8");
      const ppid = st.slice(st.lastIndexOf(")") + 2).split(" ")[1];
      const pcomm = readFileSync(`/proc/${ppid}/comm`, "utf8").trim();
      const role = (cmd.match(/--type=([a-z-]+)/) ?? [, cmd.includes("--remote-debugging-pipe") ? "browser" : "other"])[1] + "(" + d + "<" + ppid + ":" + pcomm + ")";
      const sm = readFileSync(`/proc/${d}/smaps_rollup`, "utf8");
      const g = (k) => Math.round(Number(sm.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"))?.[1] ?? 0) / 1024);
      const key = role + ":" + d;
      out[key] = { rss: g("Rss"), anon: g("Anonymous"), shmem: g("Shared_Clean") + g("Shared_Dirty"), pss: g("Pss") };
    } catch {}
  }
  return out;
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { localStorage.setItem("stillwood.test", "1"); localStorage.setItem("stillwood.graphicsQuality.v1", "high"); });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8099/");
  await page.waitForFunction(() => window.__stillwoodWorld?.stats().phase === "ready", null, { timeout: 60000 });
  if (process.argv[2] === "fence") await page.evaluate(() => {
    const v = window.__stillwoodWorld.view; const r = v.renderer; const gl = r.getContext(); const orig = r.render.bind(r);
    let sync = null; window.__real = 0; window.__skip = 0;
    r.render = (s, c) => {
      if (sync) { if (gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED) { window.__skip++; return; } gl.deleteSync(sync); sync = null; }
      orig(s, c); window.__real++; sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    };
  });
  await page.getByRole("button", { name: "Start exploring" }).click();
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const s = await Promise.race([page.evaluate(() => { const s = window.__stillwoodWorld.stats(); return { r: s.renders, real: window.__real, skip: window.__skip, ready: s.landmarksReady.length, lods: Object.values(s.lods).join(""), geo: s.geometries, tri: s.triangles, dc: s.drawCalls }; }), new Promise((r) => setTimeout(() => r(null), 4000))]);
    const rr = Object.entries(roles()).filter(([, v]) => v.rss > 20).map(([k, v]) => `${k.split(":")[0]} rss ${v.rss} anon ${v.anon} sh ${v.shmem}`).join(" | ");
    console.error(Math.round((Date.now() - t0) / 1000) + "s", JSON.stringify(s), rr);
    await new Promise((r) => setTimeout(r, 2000));
  }
} finally { await browser.close(); server.kill(); }
