#!/usr/bin/env node
// Memory supervisor for heavy local jobs (world generation, builds, browser
// tours). Written after the 2026-11-03 incident in which a headless Chromium
// tour of /world/ drove WSL out of memory (docs/evidence/world/memory-incident.md).
//
// The job runs in its own transient systemd user scope, so the kernel enforces
// a hard ceiling on the *whole* process tree (browser, GPU and renderer
// processes, the server, workers and the test runner) with swap disabled for
// the group: if everything else fails, the kernel's OOM killer acts inside
// the scope, not on WSL. The supervisor itself stays small and responsive
// when the page hangs. It samples about once a second:
//
//   - the scope's memory.current / memory.peak (cgroup accounting, not summed
//     RSS, so shared pages are counted once), plus per-process RSS by command
//     name for attribution (RSS double-counts shared pages; it's labelled so);
//   - MemAvailable and swap-in/out (pswpin/pswpout) for the whole of WSL.
//
// On a budget violation, a free-memory reserve breach, sustained swapping or a
// timeout it sends SIGTERM to the group (the job's own cleanup runs), waits a
// short grace period, then SIGKILLs only that group. It never raises the
// budget, never continues to a next stage and exits nonzero naming the stage.
//
// Usage:
//   node scripts/world/supervise.ts --stage <name> [--budget-mib N] [--timeout-s N]
//        [--log <file.jsonl>] [--grace-s N] -- <command> [args…]
//
// Defaults follow the recovery brief: budget = min(8 GiB, 0.5 × MemTotal,
// 0.5 × MemAvailable at start); the job is stopped at 90 % of the budget so an
// allocation burst between samples still lands under the kernel ceiling; the
// reserve is max(2 GiB, 0.15 × MemTotal).
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  const sep = process.argv.indexOf("--");
  return i >= 0 && (sep < 0 || i < sep) ? process.argv[i + 1] : undefined;
}
const sep = process.argv.indexOf("--");
if (sep < 0 || sep === process.argv.length - 1) {
  console.error("usage: supervise.ts --stage <name> [--budget-mib N] [--timeout-s N] [--log file] -- <command> [args…]");
  process.exit(2);
}
const command = process.argv.slice(sep + 1);
const stage = arg("--stage") ?? "job";
const timeoutS = Number(arg("--timeout-s") ?? 900);
const graceS = Number(arg("--grace-s") ?? 8);
const logFile = arg("--log");

function meminfo(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of readFileSync("/proc/meminfo", "utf8").split("\n")) {
    const m = line.match(/^(\w+):\s+(\d+)/);
    if (m) out[m[1]!] = Number(m[2]) * 1024;
  }
  return out;
}
function vmstat(): { pswpin: number; pswpout: number } {
  const s = readFileSync("/proc/vmstat", "utf8");
  const g = (k: string): number => Number(s.match(new RegExp(`^${k} (\\d+)`, "m"))?.[1] ?? 0);
  return { pswpin: g("pswpin"), pswpout: g("pswpout") };
}

const m0 = meminfo();
const total = m0.MemTotal!;
const avail0 = m0.MemAvailable!;
const defaultBudget = Math.min(8 * GiB, 0.5 * total, 0.5 * avail0);
const budget = arg("--budget-mib") ? Number(arg("--budget-mib")) * MiB : defaultBudget;
if (budget > defaultBudget) {
  console.error(`[supervise] refusing: requested budget ${(budget / MiB).toFixed(0)} MiB exceeds min(8 GiB, ½ MemTotal, ½ MemAvailable) = ${(defaultBudget / MiB).toFixed(0)} MiB`);
  process.exit(2);
}
const reserve = Math.max(2 * GiB, 0.15 * total);
const stopAt = 0.9 * budget;
if (avail0 - reserve < budget * 0.25) {
  console.error(`[supervise] not starting ${stage}: MemAvailable ${(avail0 / GiB).toFixed(2)} GiB leaves too little above the ${(reserve / GiB).toFixed(2)} GiB reserve`);
  process.exit(3);
}

const unit = `sw-${stage.replace(/[^a-zA-Z0-9_-]/g, "-")}-${process.pid}`;
const log = (rec: Record<string, unknown>): void => {
  if (!logFile) return;
  appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), stage, ...rec }) + "\n");
};
if (logFile) mkdirSync(dirname(logFile), { recursive: true });

// Prefer a kernel-enforced scope; fall back to a plain process group (telemetry only) if systemd-run is unavailable.
const hasScope = spawnSync("systemd-run", ["--user", "--scope", "-q", "true"], { stdio: "ignore" }).status === 0;
const ceilingMiB = Math.floor(budget / MiB);
const argv = hasScope
  ? ["systemd-run", "--user", "--scope", "-q", `--unit=${unit}`, "-p", `MemoryMax=${ceilingMiB}M`, "-p", "MemorySwapMax=0", "--", ...command]
  : command;
const child = spawn(argv[0]!, argv.slice(1), { stdio: "inherit", detached: true });
const started = Date.now();
log({ event: "start", command: command.join(" "), budgetMiB: ceilingMiB, stopAtMiB: Math.floor(stopAt / MiB), reserveMiB: Math.floor(reserve / MiB), memTotalMiB: Math.floor(total / MiB), memAvailableMiB: Math.floor(avail0 / MiB), scope: hasScope ? unit : null });
console.error(`[supervise] ${stage}: budget ${(budget / GiB).toFixed(2)} GiB (stop at ${(stopAt / GiB).toFixed(2)}), reserve ${(reserve / GiB).toFixed(2)} GiB, ${hasScope ? `scope ${unit}.scope (MemoryMax, no swap)` : "no systemd scope: telemetry only"}`);

function scopeDir(): string | null {
  if (!hasScope) return null;
  const base = `/sys/fs/cgroup/user.slice/user-${process.getuid!()}.slice/user@${process.getuid!()}.service/app.slice/${unit}.scope`;
  return existsSync(base) ? base : null;
}
function pidsOf(dir: string | null): number[] {
  if (dir) {
    try {
      return readFileSync(`${dir}/cgroup.procs`, "utf8").split("\n").filter(Boolean).map(Number);
    } catch {
      return [];
    }
  }
  // fallback: the process group
  const out: number[] = [];
  for (const d of readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const st = readFileSync(`/proc/${d}/stat`, "utf8");
      const pgrp = Number(st.slice(st.lastIndexOf(")") + 2).split(" ")[2]);
      if (pgrp === child.pid) out.push(Number(d));
    } catch {
      // gone
    }
  }
  return out;
}
/**
 * Descendants of the job that left its scope. Chromium asks systemd for a scope of its own
 * (app-org.chromium.Chromium-<pid>.scope) for its browser process when a session bus is available, which
 * takes that process out of this job's memory limit and its measurement (found 2026-11-04: ~96 MiB unmeasured).
 * Each one is moved back into the job's scope; if the move is refused, it is still counted and reported.
 */
const escapedLogged = new Set<number>();
function reclaimEscaped(dir: string | null, inScope: number[]): number[] {
  const scoped = new Set(inScope);
  const parent = new Map<number, number>();
  for (const d of readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const st = readFileSync(`/proc/${d}/stat`, "utf8");
      parent.set(Number(d), Number(st.slice(st.lastIndexOf(")") + 2).split(" ")[1]));
    } catch {
      // gone
    }
  }
  const roots = new Set<number>([...scoped, child.pid!]);
  const escaped: number[] = [];
  for (const [pid] of parent) {
    if (scoped.has(pid)) continue;
    let q = parent.get(pid);
    for (let k = 0; k < 32 && q && q > 1; k++) {
      if (roots.has(q)) {
        escaped.push(pid);
        break;
      }
      q = parent.get(q);
    }
  }
  const unmoved: number[] = [];
  for (const pid of escaped) {
    let moved = false;
    if (dir) {
      try {
        writeFileSync(`${dir}/cgroup.procs`, String(pid));
        moved = true;
      } catch {
        // not permitted: count it anyway
      }
    }
    if (!moved) unmoved.push(pid);
    if (!escapedLogged.has(pid)) {
      escapedLogged.add(pid);
      let cg = "?";
      try {
        cg = readFileSync(`/proc/${pid}/cgroup`, "utf8").trim();
      } catch {
        // gone
      }
      log({ event: "escaped", pid, cgroup: cg, movedBack: moved });
    }
  }
  return unmoved;
}

function rssByName(pids: number[]): { total: number; byName: Record<string, number>; top: { pid: number; name: string; rssMiB: number; adj: number }[] } {
  let sum = 0;
  const byName: Record<string, number> = {};
  const rows: { pid: number; name: string; rssMiB: number; adj: number }[] = [];
  for (const pid of pids) {
    try {
      const status = readFileSync(`/proc/${pid}/status`, "utf8");
      const rss = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) * 1024;
      const name = status.match(/^Name:\s+(.+)$/m)?.[1] ?? "?";
      // the command's process role (e.g. chrome --type=renderer / gpu-process) without arguments that could carry secrets
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").split(/[\0 ]+/); // Chrome rewrites its title space-separated
      const role = cmd.find((a) => a.startsWith("--type="))?.slice(7) ?? (name.startsWith("chrome") || name.startsWith("headless") ? "browser" : "");
      const label = role ? `${name}:${role}` : name;
      const adj = Number(readFileSync(`/proc/${pid}/oom_score_adj`, "utf8").trim());
      sum += rss;
      byName[label] = (byName[label] ?? 0) + rss;
      rows.push({ pid, name: label, rssMiB: Math.round(rss / MiB), adj });
    } catch {
      // exited between listing and reading
    }
  }
  rows.sort((a, b) => b.rssMiB - a.rssMiB);
  return { total: sum, byName, top: rows.slice(0, 6) };
}
const readNum = (p: string): number | null => {
  try {
    return Number(readFileSync(p, "utf8").trim());
  } catch {
    return null;
  }
};

let peakGroup = 0;
let peakRss = 0;
let minAvail = avail0;
const sw0 = vmstat();
let swPrev = sw0;
let swapStreak = 0;
let stopping: string | null = null;
let killTimer: NodeJS.Timeout | null = null;
let peakTop: ReturnType<typeof rssByName>["top"] = [];
/** Last seen memory.events of the scope (it vanishes when the job exits): a nonzero oom_kill is a kernel-enforced ceiling hit. */
let lastEvents: string | null = null;

function stop(reason: string): void {
  if (stopping) return;
  stopping = reason;
  console.error(`[supervise] stopping ${stage}: ${reason}`);
  log({ event: "stop", reason });
  try {
    process.kill(-child.pid!, "SIGTERM");
  } catch {
    // already gone
  }
  killTimer = setTimeout(() => {
    log({ event: "kill", reason: "grace period expired" });
    const dir = scopeDir();
    if (dir) spawnSync("systemctl", ["--user", "kill", "--signal=SIGKILL", `${unit}.scope`], { stdio: "ignore" });
    for (const pid of pidsOf(dir)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // gone
      }
    }
  }, graceS * 1000);
}

let unmeasured = 0;
function sampleOnce(): void {
  const dir = scopeDir();
  const inScope = pidsOf(dir);
  const outside = reclaimEscaped(dir, inScope);
  const pids = [...pidsOf(dir), ...outside];
  const r = rssByName(pids);
  // processes of the job that could not be moved back are outside memory.current: add their RSS to the group figure
  const outsideRss = rssByName(outside).total;
  unmeasured = Math.max(unmeasured, outside.length);
  const cur = dir ? readNum(`${dir}/memory.current`) : null;
  const pk = dir ? readNum(`${dir}/memory.peak`) : null;
  if (dir) {
    try {
      lastEvents = readFileSync(`${dir}/memory.events`, "utf8").trim().replace(/\n/g, ", ");
    } catch {
      // scope already gone
    }
  }
  const group = cur !== null ? cur + outsideRss : r.total;
  const mi = meminfo();
  const sw = vmstat();
  const dIn = sw.pswpin - swPrev.pswpin;
  const dOut = sw.pswpout - swPrev.pswpout;
  swPrev = sw;
  peakGroup = Math.max(peakGroup, pk ?? group, group);
  if (r.total > peakRss) {
    peakRss = r.total;
    peakTop = r.top;
  }
  minAvail = Math.min(minAvail, mi.MemAvailable!);
  // sustained paging (any swap traffic in 5 consecutive seconds) is failure, not success
  swapStreak = dIn + dOut > 64 ? swapStreak + 1 : 0;
  log({ event: "sample", s: Math.round((Date.now() - started) / 100) / 10, groupMiB: Math.round(group / MiB), groupPeakMiB: pk === null ? null : Math.round(pk / MiB), rssSumMiB: Math.round(r.total / MiB), availMiB: Math.round(mi.MemAvailable! / MiB), swapUsedMiB: Math.round((mi.SwapTotal! - mi.SwapFree!) / MiB), swapInPages: dIn, swapOutPages: dOut, procs: pids.length, byName: Object.fromEntries(Object.entries(r.byName).map(([k, v]) => [k, Math.round(v / MiB)])) });
  if (stopping) return;
  if (group > stopAt) stop(`task group ${(group / MiB).toFixed(0)} MiB passed the stop line ${(stopAt / MiB).toFixed(0)} MiB (budget ${(budget / MiB).toFixed(0)} MiB)`);
  else if (mi.MemAvailable! < reserve) stop(`MemAvailable ${(mi.MemAvailable! / MiB).toFixed(0)} MiB fell below the reserve ${(reserve / MiB).toFixed(0)} MiB`);
  else if (swapStreak >= 5) stop(`sustained swap traffic for ${swapStreak} s`);
  else if ((Date.now() - started) / 1000 > timeoutS) stop(`timeout after ${timeoutS} s`);
}
// 250 ms for the first two seconds (short jobs still get a reading), then about once a second
let fast = 0;
let timer: NodeJS.Timeout = setInterval(() => {
  sampleOnce();
  if (++fast === 8) {
    clearInterval(timer);
    timer = setInterval(sampleOnce, 1000);
  }
}, 250);

const forward = (sig: NodeJS.Signals): void => stop(`supervisor received ${sig}`);
process.on("SIGINT", forward);
process.on("SIGTERM", forward);

child.on("exit", (code, signal) => {
  clearInterval(timer);
  if (killTimer) clearTimeout(killTimer);
  const dir = scopeDir();
  const events = (dir ? (() => { try { return readFileSync(`${dir}/memory.events`, "utf8").trim().replace(/\n/g, ", "); } catch { return null; } })() : null) ?? lastEvents;
  // the scope may be gone before the first sample: the kernel's log names it
  const kernelOom = hasScope && spawnSync("journalctl", ["-k", "--since", new Date(started - 1000).toISOString().replace("T", " ").slice(0, 19), "-g", `oom_memcg=.*${unit}`, "-q", "--no-pager"], { encoding: "utf8" }).stdout?.trim().length > 0;
  // nothing of the group may outlive the job
  const left = pidsOf(dir);
  for (const pid of left) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // gone
    }
  }
  const sw = vmstat();
  const summary = {
    event: "end",
    exit: code,
    signal,
    stoppedBy: stopping,
    elapsedS: Math.round((Date.now() - started) / 100) / 10,
    peakGroupMiB: Math.round(peakGroup / MiB),
    peakRssSumMiB: Math.round(peakRss / MiB),
    // job processes that left the scope and could not be moved back (counted in the group figure by RSS)
    escapedUnmoved: unmeasured,
    escaped: escapedLogged.size,
    peakTop,
    minAvailMiB: Math.round(minAvail / MiB),
    swapInPages: sw.pswpin - sw0.pswpin,
    swapOutPages: sw.pswpout - sw0.pswpout,
    cgroupEvents: events,
    kernelOomKill: kernelOom || /oom_kill [1-9]/.test(events ?? ""),
    leftoverKilled: left.length,
    accounting: hasScope ? "cgroup memory.current/peak (shared pages once); rssSum double-counts shared pages" : "summed RSS of the process group (double-counts shared pages)",
  };
  log(summary);
  if (summary.kernelOomKill && !stopping) stopping = "the kernel's memory ceiling for this scope killed a process (CONSTRAINT_MEMCG)";
  console.error(`[supervise] ${stage}: ${stopping ? `STOPPED (${stopping})` : `exit ${code ?? signal}`} · peak group ${summary.peakGroupMiB} MiB · peak RSS sum ${summary.peakRssSumMiB} MiB · min MemAvailable ${summary.minAvailMiB} MiB · swap in/out ${summary.swapInPages}/${summary.swapOutPages} pages · ${summary.elapsedS} s`);
  process.exit(stopping ? 75 : (code ?? 1));
});
