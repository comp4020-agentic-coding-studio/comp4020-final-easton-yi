#!/usr/bin/env node
// Bounded, measured browser stages for the island (docs/evidence/world/memory-incident.md).
// Always run it under the supervisor, which puts the server, the browser's
// whole process tree and this driver in one memory-capped scope:
//
//   node scripts/world/supervise.ts --stage tour-B --budget-mib 3072 --log <dir>/B.supervisor.jsonl -- \
//     node scripts/world/tour.ts --stage B --out <dir>
//
// Stages (one browser, one context, one page; sequential, cleanup in finally):
//   B   home, then one landmark at the near level, back home, leave the world
//   C   repeated near → mid → far → near around one landmark
//   D   a short route through several landmarks that forces eviction
//   E   ten world → workbench → world round trips (SPA navigation; one account, one work)
//   FG  every landmark in route order, then the same route again (plateau check)
//   gpu repeated world → non-WebGL page cycles with process-level checkpoints (GPU process vs renderer,
//       RSS and PSS from /proc), then page close and context close as cleanup checkpoints
//
// Each sample (≈1 s) records the scope's cgroup memory, the page's renderer
// counters and the world's residency (loaded/detailed landmarks, pending loads,
// resident instance bytes). Resource counts are not GPU byte measurements.
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

const argv = process.argv.slice(2);
const opt = (k: string, d: string): string => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1]! : d;
};
const stage = opt("--stage", "B");
const outDir = opt("--out", "/tmp/sw-mem");
const port = Number(opt("--port", "8099"));
const [vw, vh] = opt("--viewport", "1280x720").split("x").map(Number) as [number, number];
const quality = opt("--quality", "high");
const landmark = opt("--landmark", "L01");
const label = opt("--label", stage);
const base = `http://localhost:${port}`;
mkdirSync(outDir, { recursive: true });
const samplesFile = join(outDir, `${label}.samples.jsonl`);
rmSync(samplesFile, { force: true });

const MiB = 1024 * 1024;
const t0 = Date.now();
const cgroupDir = ((): string | null => {
  try {
    const rel = readFileSync("/proc/self/cgroup", "utf8").trim().split("::")[1];
    return rel ? `/sys/fs/cgroup${rel}` : null;
  } catch {
    return null;
  }
})();
const groupMiB = (): number | null => {
  try {
    return Math.round(Number(readFileSync(`${cgroupDir}/memory.current`, "utf8")) / MiB);
  } catch {
    return null;
  }
};

let server: ChildProcess | null = null;
let browser: Browser | null = null;
let step = "start";
const steps: { step: string; start: number; end?: number; groupStart: number | null; groupPeak: number; groupEnd?: number | null; stats?: unknown; ok?: boolean; note?: string }[] = [];
let current: (typeof steps)[number] | null = null;
const errors: string[] = [];

function begin(name: string): void {
  if (current) end(true);
  step = name;
  current = { step: name, start: Math.round((Date.now() - t0) / 100) / 10, groupStart: groupMiB(), groupPeak: groupMiB() ?? 0 };
  steps.push(current);
  console.error(`[tour] ${label} · ${name}`);
}
function end(ok: boolean, note?: string): void {
  if (!current) return;
  current.end = Math.round((Date.now() - t0) / 100) / 10;
  current.groupEnd = groupMiB();
  current.ok = ok;
  if (note) current.note = note;
  current = null;
}

/** In-page probe: renderer counters + world residency; never throws, never hangs longer than 8 s. */
async function probe(page: Page): Promise<Record<string, unknown> | null> {
  const p = page.evaluate(() => {
    const w = (window as unknown as { __stillwoodWorld?: { stats(): Record<string, unknown> } }).__stillwoodWorld;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    return { world: w ? w.stats() : null, jsHeapMiB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null, jsHeapTotalMiB: mem ? Math.round(mem.totalJSHeapSize / 1048576) : null, path: location.pathname };
  });
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000));
  try {
    return (await Promise.race([p, timeout])) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

let last: Record<string, unknown> | null = null;
async function sample(page: Page): Promise<Record<string, unknown> | null> {
  const s = await probe(page);
  const g = groupMiB();
  if (current && g !== null) current.groupPeak = Math.max(current.groupPeak, g);
  const w = (s?.world ?? null) as Record<string, unknown> | null;
  const rec = {
    s: Math.round((Date.now() - t0) / 100) / 10,
    step,
    groupMiB: g,
    jsHeapMiB: s?.jsHeapMiB ?? null,
    path: s?.path ?? null,
    world: w && {
      phase: w.phase,
      control: w.control,
      tier: w.tier,
      renders: w.renders,
      drawCalls: w.drawCalls,
      triangles: w.triangles,
      geometries: w.geometries,
      textures: w.textures,
      programs: w.programs,
      landmarksReady: Array.isArray(w.landmarksReady) ? (w.landmarksReady as string[]).length : w.landmarksReady,
      residency: w.residency ?? null,
      feet: Array.isArray(w.feet) ? (w.feet as number[]).map((v) => Math.round(v)) : null,
    },
  };
  appendFileSync(samplesFile, JSON.stringify(rec) + "\n");
  last = w;
  return w;
}

/** Sample every second until `done(stats)` or the timeout; returns whether the condition was met. */
async function waitFor(page: Page, done: (w: Record<string, unknown> | null) => boolean, timeoutS: number): Promise<boolean> {
  const until = Date.now() + timeoutS * 1000;
  for (;;) {
    const w = await sample(page);
    if (done(w)) return true;
    if (Date.now() > until) return false;
    await page.waitForTimeout(1000);
  }
}
const hold = (page: Page, seconds: number): Promise<boolean> => waitFor(page, () => false, seconds).then(() => true);

type Res = { detailed?: string[]; pending?: number; nearLoading?: number };
const res = (w: Record<string, unknown> | null): Res => ((w?.residency as Res | undefined) ?? {});
/** The landmark shows real pieces nearby (new runtime: its detail is resident; old runtime: it's loaded) and nothing is pending. */
const nearReady = (id: string) => (w: Record<string, unknown> | null): boolean => {
  if (!w) return false;
  const lods = w.lods as Record<string, number> | undefined;
  const r = res(w);
  const loaded = r.detailed ? r.detailed.includes(id) : Array.isArray(w.landmarksReady) && (w.landmarksReady as string[]).includes(id);
  return lods?.[id] === 0 && loaded && (r.pending ?? 0) === 0;
};
const settled = (w: Record<string, unknown> | null): boolean => !!w && w.phase === "ready" && (res(w).pending ?? 0) === 0;

async function startServer(): Promise<void> {
  const data = `/tmp/sw-tour-${label}-data`;
  rmSync(data, { recursive: true, force: true });
  mkdirSync(data, { recursive: true });
  server = spawn(process.execPath, ["dist/server/main.js"], { env: { ...process.env, COOKIE_SECURE: "0", DATA_DIR: data, PORT: String(port), ENABLE_TEST_HOOKS: "1" }, stdio: ["ignore", "ignore", "inherit"] });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/world-data/manifest.json`, { method: "HEAD" });
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start (is dist/ built with world-data?)");
}

async function call(page: Page, fn: string, a?: unknown): Promise<unknown> {
  return page.evaluate(([f, x]) => {
    const v = (window as unknown as { __stillwoodWorld?: { view: Record<string, (...args: unknown[]) => unknown> } }).__stillwoodWorld?.view;
    if (!v) return null;
    return v[f as string]!(x);
  }, [fn, a] as const);
}
/** Teleport (loads the destination first), then resume continuous rendering as an explorer would. */
async function jump(page: Page, target: { feet: number[]; yaw: number; pitch?: number }): Promise<void> {
  await call(page, "jumpTo", target);
  await call(page, "takeControl", { pointerLock: false });
}
async function viewpoint(page: Page, id: string, kind = "ground"): Promise<{ feet: number[]; yaw: number; pitch: number } | null> {
  return page.evaluate(([lid, k]) => {
    const m = (window as unknown as { __stillwoodWorld?: { view: { manifest: { landmarks: { id: string; viewpoints: { kind: string; eye: number[]; yaw: number; pitch: number }[]; safePoints: { feet: number[]; yaw: number }[] }[] } } } }).__stillwoodWorld?.view.manifest;
    const l = m?.landmarks.find((x) => x.id === lid);
    if (!l) return null;
    const vp = l.viewpoints.find((v) => v.kind === k) ?? l.viewpoints[0];
    if (vp) return { feet: [vp.eye[0]!, vp.eye[1]! - 1.65, vp.eye[2]!], yaw: vp.yaw, pitch: vp.pitch };
    const sp = l.safePoints[0]!;
    return { feet: sp.feet, yaw: sp.yaw, pitch: 0 };
  }, [id, kind] as const);
}
/** A point `dist` m from the landmark's centre, toward home (open ground), high enough to be dropped to the ground. */
async function ringPoint(page: Page, id: string, dist: number): Promise<{ feet: number[]; yaw: number } | null> {
  return page.evaluate(([lid, d]) => {
    const m = (window as unknown as { __stillwoodWorld?: { view: { manifest: { home: { spawn: number[] }; landmarks: { id: string; placement: { position: number[] } }[] } } } }).__stillwoodWorld?.view.manifest;
    const l = m?.landmarks.find((x) => x.id === lid);
    if (!m || !l) return null;
    const [x, , z] = l.placement.position as [number, number, number];
    let dx = m.home.spawn[0]! - x;
    let dz = m.home.spawn[2]! - z;
    const n = Math.hypot(dx, dz) || 1;
    dx /= n;
    dz /= n;
    return { feet: [x + dx * d, 900, z + dz * d], yaw: Math.atan2(dx, dz) };
  }, [id, dist] as const);
}
async function routeOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const m = (window as unknown as { __stillwoodWorld?: { view: { manifest: { landmarks: { id: string; placement: { routeDistance: number } }[] } } } }).__stillwoodWorld?.view.manifest;
    return m ? [...m.landmarks].sort((a, b) => a.placement.routeDistance - b.placement.routeDistance).map((l) => l.id) : [];
  });
}

/** SPA navigation (pushState + popstate), so React unmounts/mounts the world exactly as an in-app link would. */
async function spaGo(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    history.pushState(null, "", p);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function openHome(page: Page): Promise<boolean> {
  begin("home: load");
  await page.goto(`${base}/`);
  const ok = await waitFor(page, (w) => !!w && w.phase === "ready" && Number(w.renders) > 0, 120);
  if (!ok) return false;
  await page.getByRole("button", { name: "Start exploring" }).click();
  begin("home: settle (exploring)");
  await waitFor(page, settled, 120);
  await hold(page, 5);
  return true;
}

async function leaveWorld(page: Page): Promise<void> {
  begin("leave world (/readme/)");
  await spaGo(page, "/works/");
  await hold(page, 6);
}

async function registerAndWork(page: Page): Promise<string> {
  const h = `tour_${Date.now().toString(36)}`;
  await page.goto(`${base}/register/?next=%2Fworks%2F`);
  await page.getByLabel("Handle").fill(h);
  await page.getByLabel("Display name").fill("Tour");
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("I've stored this code somewhere safe").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/works\/$/);
  await page.getByLabel("New work name").fill("Tour work");
  await page.getByRole("button", { name: "Create work" }).click();
  await page.waitForURL(/\/works\/[0-9a-f-]{36}\//);
  return new URL(page.url()).pathname;
}

/**
 * This task's browser processes by role (renderer, gpu-process, utility:…, browser) with RSS, PSS and private
 * memory in MiB, from /proc. "This task's" = in the same cgroup as this driver (the supervisor's scope), so
 * nothing else on the machine is counted.
 */
function chromeProcs(): { role: string; pid: number; rssMiB: number; pssMiB: number | null; privateMiB: number | null }[] {
  const out: { role: string; pid: number; rssMiB: number; pssMiB: number | null; privateMiB: number | null }[] = [];
  let mine: string;
  let pids: string[];
  try {
    mine = readFileSync("/proc/self/cgroup", "utf8").trim();
    pids = readdirSync("/proc").filter((d) => /^\d+$/.test(d));
  } catch {
    return out;
  }
  for (const p of pids) {
    try {
      if (readFileSync(`/proc/${p}/cgroup`, "utf8").trim() !== mine) continue;
      // Chromium rewrites its children's argv into one space-separated string (a single trailing NUL)
      const cmd = readFileSync(`/proc/${p}/cmdline`, "utf8").split(/[\0 ]+/);
      if (!cmd[0] || !/chrom|headless_shell/.test(cmd[0])) continue;
      const type = cmd.find((a) => a.startsWith("--type="))?.slice(7) ?? "browser";
      const sub = cmd.find((a) => a.startsWith("--utility-sub-type="))?.slice(19);
      const rss = Number(readFileSync(`/proc/${p}/status`, "utf8").match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) / 1024;
      let pss: number | null = null;
      let priv: number | null = null;
      try {
        const r = readFileSync(`/proc/${p}/smaps_rollup`, "utf8");
        pss = Number(r.match(/^Pss:\s+(\d+)/m)?.[1] ?? 0) / 1024;
        priv = (Number(r.match(/^Private_Clean:\s+(\d+)/m)?.[1] ?? 0) + Number(r.match(/^Private_Dirty:\s+(\d+)/m)?.[1] ?? 0)) / 1024;
      } catch {
        // not readable
      }
      out.push({ role: sub ? `${type}:${sub}` : type, pid: Number(p), rssMiB: Math.round(rss), pssMiB: pss === null ? null : Math.round(pss), privateMiB: priv === null ? null : Math.round(priv) });
    } catch {
      // process went away
    }
  }
  return out.sort((a, b) => a.role.localeCompare(b.role) || a.pid - b.pid);
}

async function main(): Promise<void> {
  await startServer();
  browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  await ctx.addInitScript((q) => {
    localStorage.setItem("stillwood.test", "1");
    localStorage.setItem("stillwood.graphicsQuality.v1", q);
  }, quality);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.length < 40 && errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.length < 40 && errors.push(`console: ${m.text().slice(0, 300)}`));
  const env: Record<string, unknown> = { stage, viewport: `${vw}x${vh}`, quality, browser: browser.version(), headless: true };
  try {
    if (stage === "inspect") {
      // component preview + per-landmark review views from the development inspector, one capture at a time
      const only = opt("--only", "");
      const comps = ["doric", "ionic", "corinthian", "lotus", "steps", "round-arch", "pointed-arch", "dome", "braced", "spillway"];
      const views: string[] = opt("--views", "45,eye,detail,plan").split(",");
      const items = only ? only.split(",") : [...comps.map((c) => `c:${c}`), ...Array.from({ length: 20 }, (_, i) => `l:L${String(i + 1).padStart(2, "0")}`)];
      const rows: Record<string, unknown>[] = [];
      for (const it of items) {
        const [kind, id] = it.split(":") as [string, string];
        for (const v of kind === "c" ? ["45", "eye", "detail"] : views) {
          begin(`${it} ${v}`);
          await page.goto(`${base}/world/inspect/?${kind}=${id}&view=${v}`);
          const ok = await page.waitForFunction(() => {
            const w = (window as unknown as { __stillwoodInspect?: { ready(): string | null; counts(): { shown: number } | null } }).__stillwoodInspect;
            return !!w && !!w.ready() && (w.counts()?.shown ?? 0) > 0;
          }, null, { timeout: 60_000 }).then(() => true, () => false);
          await page.waitForTimeout(1200);
          const counts = await page.evaluate(() => (window as unknown as { __stillwoodInspect?: { counts(): unknown } }).__stillwoodInspect?.counts() ?? null);
          const file = `${label}-${kind === "c" ? "component" : "landmark"}-${id}-${v}.png`;
          await page.locator(".inspect-host").screenshot({ path: join(outDir, file) });
          rows.push({ item: it, view: v, ok, counts, file });
          end(ok);
        }
      }
      env.inspect = rows;
    } else if (stage === "views") {
      // world-level viewpoint audit: every landmark's authored viewpoints reached in the real world (terrain,
      // neighbours, collision), the eye actually reached vs authored, the plaque shown, and a screenshot
      if (!(await openHome(page))) throw new Error("world never became ready");
      env.gl = await glRenderer(page);
      const rows: Record<string, unknown>[] = [];
      const ids = opt("--only", Array.from({ length: 20 }, (_, i) => `L${String(i + 1).padStart(2, "0")}`).join(",")).split(",");
      for (const id of ids) {
        const vps = await page.evaluate((lid) => {
          const m = (window as unknown as { __stillwoodWorld: { view: { manifest: { landmarks: { id: string; viewpoints: { id: string; kind: string; eye: number[]; yaw: number; pitch: number }[] }[] } } } }).__stillwoodWorld.view.manifest;
          return m.landmarks.find((l) => l.id === lid)!.viewpoints;
        }, id);
        for (const vp of vps) {
          begin(`${id} ${vp.kind}`);
          await jump(page, { feet: [vp.eye[0]!, vp.eye[1]! - 1.65, vp.eye[2]!], yaw: vp.yaw, pitch: vp.pitch });
          await waitFor(page, (w) => nearReady(id)(w) || (settled(w) && (w?.lods as Record<string, number> | undefined)?.[id] !== 0), 90);
          await hold(page, 1);
          const st = await page.evaluate(() => {
            const w = (window as unknown as { __stillwoodWorld: { stats(): Record<string, unknown>; view: { getStatus(): { nearLandmark: { id?: string; title: string; distance: number } | null } } } }).__stillwoodWorld;
            return { feet: w.stats().feet as number[], flying: w.stats().flying, near: w.view.getStatus().nearLandmark };
          });
          const eye = [st.feet[0]!, st.feet[1]! + 1.65, st.feet[2]!];
          const off = Math.hypot(eye[0]! - vp.eye[0]!, eye[1]! - vp.eye[1]!, eye[2]! - vp.eye[2]!);
          const file = `${label}-view-${id}-${vp.kind}.png`;
          await page.screenshot({ path: join(outDir, file) });
          rows.push({ id, kind: vp.kind, authored: vp.eye, reached: eye.map((v) => Math.round(v * 100) / 100), off: Math.round(off * 10) / 10, flying: st.flying, plaque: st.near?.title ?? null, file });
          end(off < 1, off >= 1 ? `reached ${off.toFixed(1)} m from the authored eye` : undefined);
        }
      }
      // extra named poses (--extra file.json: [{ name, eye: [x, y, z], target: [x, y, z] }]), e.g. the §13.1 captures
      const extraFile = opt("--extra", "");
      if (extraFile) {
        for (const x of JSON.parse(readFileSync(extraFile, "utf8")) as { name: string; eye: number[]; target: number[] }[]) {
          begin(`extra ${x.name}`);
          const d = [x.target[0]! - x.eye[0]!, x.target[1]! - x.eye[1]!, x.target[2]! - x.eye[2]!];
          const pose = { feet: [x.eye[0]!, x.eye[1]! - 1.65, x.eye[2]!], yaw: Math.atan2(-d[0]!, -d[2]!), pitch: Math.atan2(d[1]!, Math.hypot(d[0]!, d[2]!)) };
          await jump(page, pose);
          await waitFor(page, settled, 90);
          await hold(page, 2);
          const feet = ((await page.evaluate(() => (window as unknown as { __stillwoodWorld: { stats(): Record<string, unknown> } }).__stillwoodWorld.stats().feet)) as number[]) ?? [];
          const file = `${label}-extra-${x.name.replace(/[^A-Za-z0-9]+/g, "-")}.png`;
          await page.screenshot({ path: join(outDir, file) });
          rows.push({ id: "extra", kind: x.name, authored: x.eye, reached: [feet[0], (feet[1] ?? 0) + 1.65, feet[2]], file });
          end(true);
        }
      }
      env.views = rows;
    } else if (stage === "tris") {
      // triangle accounting (WorldView.triangleBreakdown) at representative demanding views: the settled home
      // view, then for each listed landmark its ground/interior/high/detail viewpoints (--kinds), each with a
      // screenshot at the same pose so before/after can be compared side by side; then home again
      if (!(await openHome(page))) throw new Error("world never became ready");
      env.gl = await glRenderer(page);
      const rows: Record<string, unknown>[] = [];
      const kinds = opt("--kinds", "ground").split(",");
      const shots = opt("--shots", "1") === "1";
      const measure = async (name: string): Promise<void> => {
        await hold(page, 2);
        const b = await call(page, "triangleBreakdown");
        const w = await sample(page);
        const file = `${label}-tris-${name.replace(/[^A-Za-z0-9]+/g, "-")}.png`;
        if (shots) await page.screenshot({ path: join(outDir, file) });
        rows.push({ view: name, lods: w?.lods, breakdown: b, file: shots ? file : null });
        console.log(`[tour] ${label} · tris ${name}: ${JSON.stringify((b as { total: number }).total)}`);
      };
      begin("home view");
      await measure("home");
      end(true);
      for (const id of opt("--only", "L01,L03").split(",").filter(Boolean)) {
        for (const k of kinds) {
          begin(`${id} ${k}`);
          const vp = await viewpoint(page, id, k);
          if (!vp) throw new Error(`no viewpoint for ${id}`);
          await jump(page, vp);
          // near views wait for the landmark's detail; distant ones (high) only for streaming to settle
          await waitFor(page, (w) => nearReady(id)(w) || (settled(w) && (w?.lods as Record<string, number> | undefined)?.[id] !== 0), 120);
          await measure(`${id} ${k}`);
          end(true);
        }
      }
      begin("home again");
      await call(page, "goHome");
      await call(page, "takeControl", { pointerLock: false });
      await waitFor(page, settled, 60);
      await measure("home again");
      end(true);
      env.tris = rows;
    } else if (stage === "gpu") {
      // GPU-process trend under repeated scene switching (docs/evidence/world/memory-incident.md §9). Each cycle:
      // world mounted from a cold SPA navigation → exploring → two landmarks at their near level (detail upload,
      // then the first is left behind) → home → leave the world for /login/ (no WebGL anywhere on the page) →
      // hold, then a checkpoint. Every checkpoint is taken in the same state (no live WebGL context), so the
      // trend compares like with like. After the cycles: close the page, then the context, each a checkpoint.
      const cycles = Number(opt("--cycles", "12"));
      // --pair none: mount the world and stay home (no landmark detail uploaded), to separate detail uploads from the rest
      const pair = opt("--pair", "L03,L09").split(",").filter((x) => x && x !== "none");
      const checkpoints: Record<string, unknown>[] = [];
      const checkpoint = async (name: string, holdS: number): Promise<void> => {
        begin(`checkpoint ${name}`);
        // a plain timer: after page.close() the page's own waitForTimeout rejects at once
        if (holdS > 0) await new Promise((r) => setTimeout(r, holdS * 1000));
        const procs = chromeProcs();
        const pick = (r: string): { rss: number; pss: number | null; priv: number | null } => {
          const xs = procs.filter((p) => p.role === r);
          return { rss: xs.reduce((a, p) => a + p.rssMiB, 0), pss: xs.every((p) => p.pssMiB !== null) ? xs.reduce((a, p) => a + p.pssMiB!, 0) : null, priv: xs.every((p) => p.privateMiB !== null) ? xs.reduce((a, p) => a + p.privateMiB!, 0) : null };
        };
        const row = { name, s: Math.round((Date.now() - t0) / 100) / 10, groupMiB: groupMiB(), gpu: pick("gpu-process"), renderer: pick("renderer"), browser: pick("browser"), procs };
        checkpoints.push(row);
        appendFileSync(samplesFile, JSON.stringify({ checkpoint: row }) + "\n");
        console.log(`[tour] ${label} · ${name}: group ${row.groupMiB} MiB · gpu rss ${row.gpu.rss} pss ${row.gpu.pss} · renderer rss ${row.renderer.rss} pss ${row.renderer.pss}`);
        end(true);
      };
      await page.goto(`${base}/login/`);
      await checkpoint("baseline (no world yet)", 8);
      for (let i = 1; i <= cycles; i++) {
        begin(`cycle ${i}: world`);
        await spaGo(page, "/");
        if (!(await waitFor(page, (w) => !!w && w.phase === "ready" && Number(w.renders) > 0, 120))) throw new Error(`cycle ${i}: world never became ready`);
        await page.getByRole("button", { name: "Start exploring" }).click();
        await waitFor(page, settled, 120);
        for (const id of pair) {
          begin(`cycle ${i}: ${id} near`);
          const vp = await viewpoint(page, id);
          await jump(page, vp!);
          if (!(await waitFor(page, nearReady(id), 120))) end(false, "near detail never became ready");
          else await hold(page, 2);
        }
        begin(`cycle ${i}: home`);
        await call(page, "goHome");
        await call(page, "takeControl", { pointerLock: false });
        await waitFor(page, settled, 60);
        begin(`cycle ${i}: leave`);
        await spaGo(page, "/login/");
        await page.locator("canvas").first().waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined);
        const canvases = await page.evaluate(() => document.querySelectorAll("canvas").length);
        if (canvases) errors.push(`cycle ${i}: ${canvases} canvas element(s) left after leaving the world`);
        await checkpoint(`after cycle ${i}`, 8);
      }
      // cleanup: the page (its renderer process and its GPU-process clients), then the browser context
      await page.close();
      await checkpoint("page closed", 10);
      await ctx.close();
      await checkpoint("context closed", 10);
      env.gpu = { cycles, pair, checkpoints };
    } else if (stage === "gpu-control") {
      // control for the gpu stage: the same number of cycles of a bare WebGL2 context (no app code): create a
      // canvas the size of the world stage, draw for ~2 s (a cleared, depth-tested full-screen triangle each frame),
      // lose the context and remove the canvas, then the same no-WebGL checkpoint. If the GPU process grows as it
      // does under the app, the growth is the browser's per-context cost, not the app's resources.
      const cycles = Number(opt("--cycles", "30"));
      const checkpoints: Record<string, unknown>[] = [];
      const snap = async (name: string, holdS: number): Promise<void> => {
        begin(`checkpoint ${name}`);
        if (holdS > 0) await new Promise((r) => setTimeout(r, holdS * 1000));
        const procs = chromeProcs();
        const sum = (r: string, k: "rssMiB" | "pssMiB" | "privateMiB"): number => procs.filter((p) => p.role === r).reduce((a, p) => a + (p[k] ?? 0), 0);
        const row = { name, s: Math.round((Date.now() - t0) / 100) / 10, groupMiB: groupMiB(), gpu: { rss: sum("gpu-process", "rssMiB"), pss: sum("gpu-process", "pssMiB"), priv: sum("gpu-process", "privateMiB") }, renderer: { rss: sum("renderer", "rssMiB"), pss: sum("renderer", "pssMiB") }, procs };
        checkpoints.push(row);
        appendFileSync(samplesFile, JSON.stringify({ checkpoint: row }) + "\n");
        console.log(`[tour] ${label} · ${name}: group ${row.groupMiB} MiB · gpu rss ${row.gpu.rss} pss ${row.gpu.pss} · renderer rss ${row.renderer.rss}`);
        end(true);
      };
      await page.goto(`${base}/login/`);
      await snap("baseline", 8);
      for (let i = 1; i <= cycles; i++) {
        begin(`cycle ${i}: bare context`);
        await page.evaluate(async ([w, h]) => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          document.body.appendChild(c);
          const gl = c.getContext("webgl2", { antialias: true, depth: true })!;
          const vs = gl.createShader(gl.VERTEX_SHADER)!;
          gl.shaderSource(vs, "#version 300 es\nvoid main(){vec2 p=vec2(float(gl_VertexID&1)*4.0-1.0,float(gl_VertexID>>1)*4.0-1.0);gl_Position=vec4(p,0.5,1.0);}");
          gl.compileShader(vs);
          const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
          gl.shaderSource(fs, "#version 300 es\nprecision mediump float;out vec4 o;void main(){o=vec4(0.4,0.6,0.3,1.0);}");
          gl.compileShader(fs);
          const prog = gl.createProgram()!;
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.linkProgram(prog);
          gl.useProgram(prog);
          gl.enable(gl.DEPTH_TEST);
          const until = performance.now() + 2000;
          await new Promise<void>((done) => {
            const frame = (): void => {
              gl.clearColor(0.8, 0.9, 1, 1);
              gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
              gl.drawArrays(gl.TRIANGLES, 0, 3);
              if (performance.now() < until) requestAnimationFrame(frame);
              else done();
            };
            requestAnimationFrame(frame);
          });
          gl.deleteProgram(prog);
          gl.deleteShader(vs);
          gl.deleteShader(fs);
          gl.getExtension("WEBGL_lose_context")?.loseContext();
          c.remove();
        }, [vw, Math.round(vh * 0.78)] as const);
        await snap(`after cycle ${i}`, 8);
      }
      await page.close();
      await snap("page closed", 10);
      await ctx.close();
      await snap("context closed", 10);
      env.gpuControl = { cycles, checkpoints };
    } else if (stage === "E") {
      begin("register + create work");
      const work = await registerAndWork(page);
      if (!(await openHome(page))) throw new Error("world never became ready");
      env.gl = await glRenderer(page);
      const trips = Number(opt("--trips", "10"));
      for (let i = 1; i <= trips; i++) {
        begin(`round trip ${i}: workbench`);
        await spaGo(page, work);
        await waitFor(page, () => false, 1);
        await page.locator(".conn-open").waitFor({ timeout: 60000 });
        await hold(page, 3);
        begin(`round trip ${i}: world`);
        await spaGo(page, "/");
        await waitFor(page, (w) => !!w && w.phase === "ready" && Number(w.renders) > 0, 120);
        await page.getByRole("button", { name: "Start exploring" }).click();
        await waitFor(page, settled, 120);
        await hold(page, 3);
      }
      await leaveWorld(page);
    } else {
      if (!(await openHome(page))) throw new Error("world never became ready");
      env.gl = await glRenderer(page);
      if (stage === "B") {
        begin(`${landmark}: near`);
        const vp = await viewpoint(page, landmark);
        if (!vp) throw new Error(`no viewpoint for ${landmark}`);
        await jump(page, vp);
        if (!(await waitFor(page, nearReady(landmark), 120))) end(false, "near detail never became ready");
        else await hold(page, 10);
        begin("home again");
        await call(page, "goHome");
        await call(page, "takeControl", { pointerLock: false });
        await waitFor(page, settled, 60);
        await hold(page, 10);
        await leaveWorld(page);
      } else if (stage === "C") {
        const vp = await viewpoint(page, landmark);
        if (!vp) throw new Error(`no viewpoint for ${landmark}`);
        for (let i = 1; i <= 6; i++) {
          begin(`cycle ${i}: near`);
          await jump(page, vp);
          await waitFor(page, nearReady(landmark), 120);
          await hold(page, 3);
          for (const [name, d] of [["mid", 380], ["far", 950]] as const) {
            begin(`cycle ${i}: ${name}`);
            const p = await ringPoint(page, landmark, d);
            await jump(page, p!);
            await waitFor(page, settled, 60);
            await hold(page, 3);
          }
        }
        await leaveWorld(page);
      } else if (stage === "D") {
        const order = (await routeOrder(page)).slice(0, 7);
        for (const id of order) {
          begin(`${id}: near`);
          const vp = await viewpoint(page, id);
          await jump(page, vp!);
          if (!(await waitFor(page, nearReady(id), 120))) end(false, "near detail never became ready");
          else {
            await page.keyboard.down("KeyW");
            await hold(page, 2);
            await page.keyboard.up("KeyW");
            await hold(page, 2);
          }
        }
        await leaveWorld(page);
      } else if (stage === "FG") {
        const order = await routeOrder(page);
        for (const pass of [1, 2]) {
          for (const id of order) {
            begin(`pass ${pass} ${id}: near`);
            const vp = await viewpoint(page, id);
            await jump(page, vp!);
            if (!(await waitFor(page, nearReady(id), 120))) end(false, "near detail never became ready");
            else await hold(page, 2);
          }
          begin(`pass ${pass}: home`);
          await call(page, "goHome");
          await call(page, "takeControl", { pointerLock: false });
          await waitFor(page, settled, 60);
          await hold(page, 8);
        }
        await leaveWorld(page);
      } else if (stage === "context") {
        // context loss/restore while exploring (three cycles): rendering stops, control is released, menus stay usable,
        // the frame fence is dropped, frames resume after restore and input moves the player again
        const results: Record<string, unknown>[] = [];
        for (let i = 1; i <= 3; i++) {
          begin(`cycle ${i}: explore + walk`);
          // home faces the three portals: walk backwards (S) so a long hold never carries the player through one
          await call(page, "goHome");
          // start each cycle from a known state: exploring (already, or resumed from the pause menu)
          if ((last as { control?: string } | null)?.control !== "exploring") await page.getByRole("button", { name: /Start exploring|Resume exploring/ }).click();
          await page.keyboard.down("KeyS");
          await hold(page, 2);
          begin(`cycle ${i}: lose context`);
          await page.evaluate(() => {
            const v = (window as unknown as { __stillwoodWorld: { view: { renderer: { getContext(): WebGL2RenderingContext } } } }).__stillwoodWorld.view;
            (window as unknown as { __lose: WEBGL_lose_context | null }).__lose = v.renderer.getContext().getExtension("WEBGL_lose_context");
            (window as unknown as { __lose: WEBGL_lose_context }).__lose.loseContext();
          });
          await page.keyboard.up("KeyS");
          const lost = await waitFor(page, (w) => w?.phase === "context-lost", 20);
          const lostState = last as Record<string, unknown> | null;
          const rendersLost = Number(lostState?.renders ?? 0);
          await hold(page, 2);
          const rendersStill = Number((last as Record<string, unknown> | null)?.renders ?? 0);
          const notice = await page.getByText("The graphics context was lost").isVisible().catch(() => false);
          begin(`cycle ${i}: restore`);
          await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
          const back = await waitFor(page, (w) => w?.phase === "ready", 30);
          await hold(page, 2);
          const afterRestore = last as Record<string, unknown> | null;
          begin(`cycle ${i}: input after restore`);
          // after loss the world is paused; resuming is the user's explicit gesture
          const resume = page.getByRole("button", { name: /Start exploring|Resume exploring/ });
          const resumable = await resume.isVisible().catch(() => false);
          if (resumable) await resume.click();
          await hold(page, 1);
          const feet0 = ((last as { feet?: number[] } | null)?.feet ?? [0, 0, 0]).slice();
          await page.keyboard.down("KeyS");
          await hold(page, 3);
          await page.keyboard.up("KeyS");
          await hold(page, 1);
          const w2 = last as Record<string, unknown> | null;
          const feet1 = (w2?.feet as number[] | undefined) ?? feet0;
          const moved = Math.hypot(feet1[0]! - feet0[0]!, feet1[2]! - feet0[2]!);
          const res2 = (w2?.residency ?? {}) as { fencePending?: boolean; contextRestores?: number };
          results.push({ cycle: i, resumeButtonAfterRestore: resumable, lost, rendersStoppedWhileLost: rendersStill === rendersLost, noticeShown: notice, restored: back, rendersAfterRestore: Number(afterRestore?.renders ?? 0) > rendersStill, movedAfterRestore: Math.round(moved * 10) / 10, contextRestores: res2.contextRestores });
          await page.keyboard.press("Escape");
          await hold(page, 1);
          await sample(page);
        }
        env.context = results;
        await leaveWorld(page);
      } else if (stage === "fly") {
        // the interrupted check of 2026-11-03 (walk, fly up, look, pause), now bounded: screenshots go straight to disk
        const shot = async (name: string): Promise<void> => void (await page.screenshot({ path: join(outDir, `${label}-${name}.png`) }));
        await shot("home");
        begin("walk forward 3 s");
        await page.keyboard.down("KeyW");
        await hold(page, 3);
        await page.keyboard.up("KeyW");
        begin("fly up 3 s");
        await page.keyboard.down("Space");
        await hold(page, 3);
        await page.keyboard.up("Space");
        const flew = last as { feet?: number[] } | null;
        await shot("flying");
        // every visible control of the world overlay must be the topmost element at its own centre (visible-but-unclickable is a regression)
        const covered = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>(".world-overlay a, .world-overlay button")) {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (top && top !== el && !el.contains(top)) out.push(`${el.textContent?.trim()} ← ${top.textContent?.trim().slice(0, 30)}`);
          }
          return out;
        });
        begin("pause (Escape)");
        await page.keyboard.press("Escape");
        await hold(page, 2);
        await shot("paused");
        const menu = await page.getByRole("group", { name: "Paused" }).isVisible();
        begin("return to a safe point");
        await page.getByRole("button", { name: /safe point/i }).click();
        await waitFor(page, settled, 60);
        await hold(page, 2);
        env.fly = { feetAfterFlight: flew?.feet ?? null, pauseMenu: menu, control: (last as { control?: string } | null)?.control ?? null, coveredWhileExploring: covered };
        await leaveWorld(page);
      } else throw new Error(`unknown stage ${stage}`);
    }
    end(true);
  } finally {
    if (current) end(false, "interrupted");
    try {
      await ctx.close();
    } catch {
      // already closed
    }
    const summary = { label, env, elapsedS: Math.round((Date.now() - t0) / 100) / 10, steps, lastWorld: last, errors };
    writeFileSync(join(outDir, `${label}.summary.json`), JSON.stringify(summary, null, 1));
  }
}

async function glRenderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2");
    const d = g?.getExtension("WEBGL_debug_renderer_info");
    const r = d ? String(g!.getParameter(d.UNMASKED_RENDERER_WEBGL)) : "n/a";
    g?.getExtension("WEBGL_lose_context")?.loseContext();
    return r;
  });
}

let exitCode = 0;
const shutdown = async (): Promise<void> => {
  try {
    await browser?.close();
  } catch {
    // gone
  }
  server?.kill("SIGTERM");
};
process.on("SIGTERM", () => {
  console.error(`[tour] ${label}: SIGTERM at step "${step}"`);
  void shutdown().then(() => process.exit(143));
});
try {
  await main();
} catch (e) {
  exitCode = 1;
  console.error(`[tour] ${label} failed at "${step}": ${(e as Error).message}`);
} finally {
  await shutdown();
}
process.exit(exitCode);
