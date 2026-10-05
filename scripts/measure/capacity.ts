// P5 capacity profile (WORLD-04, §5.4): 3 live rooms × 4 editor sessions,
// built up to 200 sticks each through the real command path, then a "rain"
// of sticks dropped from height into all three rooms at once (many awake
// bodies, collisions, a full snapshot commit per placement), with live ghosts
// streaming from every window and concurrent logins. Samples /readyz (server
// RSS, coordinator pass cost, event-loop delay) throughout.
//   APP_URL=http://localhost:8080 node scripts/measure/capacity.ts
import { performance } from "node:perf_hooks";
import { Client, Window, sleep } from "../../spec/helpers.ts";

const base = process.env.APP_URL ?? "http://localhost:8080";
const ROOMS = Number(process.env.ROOMS ?? 3);
const MAT = Number(process.env.MAT ?? 150);
const RAIN = Number(process.env.RAIN ?? 50);
const ALONG_X: [number, number, number, number] = [0, 0, 0, 1];
const ALONG_Z: [number, number, number, number] = [0, -Math.SQRT1_2, 0, Math.SQRT1_2];

interface Sample { t: number; heap: number; heapTotal: number; ab: number; rss: number; passP95: number; passMax: number; loopP99: number; overloads: number; sticks: number; rooms: number }
const samples: Sample[] = [];
const phaseMarks: { name: string; t: number }[] = [];
const mark = (name: string): void => {
  phaseMarks.push({ name, t: performance.now() });
  console.error(`[${new Date().toISOString()}] ${name}`);
};
let sampling = true;
const sampler = (async () => {
  while (sampling) {
    try {
      const h = await (await fetch(`${base}/readyz`)).json();
      samples.push({ t: performance.now(), heap: h.workerHeapMiB + h.mainHeapMiB, heapTotal: h.workerHeapTotalMiB, ab: h.arrayBuffersMiB, rss: h.rssMiB, passP95: h.tick.p95Ms, passMax: h.tick.maxMs, loopP99: h.eventLoopDelayMs.p99, overloads: h.tick.overloadEvents, sticks: h.sticks, rooms: h.rooms });
    } catch {
      // keep sampling
    }
    await sleep(500);
  }
})();

const ack: Record<string, number[]> = {};
const seen: number[] = [];
const rejected: Record<string, number> = {};
const pct = (xs: number[], p: number): number => (xs.length ? [...xs].sort((a, b) => a - b)[Math.ceil((xs.length - 1) * p)]! : NaN);
const summary = (xs: number[]) => ({ n: xs.length, p50: +pct(xs, 0.5).toFixed(1), p95: +pct(xs, 0.95).toFixed(1), max: xs.length ? +Math.max(...xs).toFixed(1) : NaN });

/** Mat positions: layers of 50 crossing sticks, each layer on the one below. */
const matPose = (i: number): { p: [number, number, number]; q: [number, number, number, number] } => {
  const layer = Math.floor(i / 50);
  const k = i % 50;
  const y = 0.505 + layer * 1.006;
  const off = -14.4 + (k % 25) * 1.2;
  const row = k < 25 ? -4.5 : 4.5;
  return layer % 2 === 0 ? { p: [off, y, row], q: ALONG_Z } : { p: [row, y, off], q: ALONG_X };
};

async function place(w: Window, phase: string, pose: { p: number[]; q: number[] }, other: Window): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = performance.now();
    const id = w.command("place", { pose });
    const r = await w.result(id);
    if (r.outcome === "accepted") {
      (ack[phase] ??= []).push(r.receivedAt - t0);
      other
        .waitFor((m) => m.type === "sticks.added" && m.sticks.some((s: { id: string }) => s.id === r.stickId), 15_000)
        .then((m) => seen.push(m.receivedAt - t0))
        .catch(() => undefined);
      return true;
    }
    rejected[r.code] = (rejected[r.code] ?? 0) + 1;
    if (r.code === "RATE_LIMITED") await sleep((r.retryAfterMs ?? 500) + 20);
    else if (r.code === "COLLISION") pose = { ...pose, p: [pose.p[0]!, pose.p[1]! + 0.01, pose.p[2]!] };
    else if (r.code === "STALE_VIEW") await sleep(50);
    else return false;
  }
  return false;
}

mark("setup");
const rooms: { workId: string; windows: Window[]; clients: Client[] }[] = [];
for (let r = 0; r < ROOMS; r++) {
  const owner = await new Client(base).register(`Cap owner ${r}`);
  const workId = await owner.createWork(`Capacity room ${r}`);
  const clients = [owner];
  for (let e = 0; e < 3; e++) {
    const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
    const c = await new Client(base).register(`Cap editor ${r}.${e}`);
    await c.req("POST", "/api/invites/accept", { token });
    clients.push(c);
  }
  const windows: Window[] = [];
  for (const c of clients) windows.push(await Window.open(c, workId));
  if (!windows.every((w) => w.snapshot.live && w.snapshot.lease)) throw new Error(`room ${r} not live with 4 leases`);
  rooms.push({ workId, windows, clients });
}

// Every window streams ghost poses at the 15 Hz client cap throughout.
let ghosts = true;
const ghostLoops = rooms.flatMap((room) =>
  room.windows.map(async (w, i) => {
    let seq = 0;
    while (ghosts) {
      const t = performance.now() / 1000;
      w.send({ type: "draft.pose", seq: ++seq, epoch: w.snapshot.epoch, pose: { p: [Math.cos(t + i) * 10, 30, Math.sin(t + i) * 10], q: [0, 0, 0, 1] } });
      await sleep(1000 / 15);
    }
  }),
);

mark("mat");
await Promise.all(
  rooms.map(async (room) => {
    for (let layer = 0; layer * 50 < MAT; layer++) {
      // the four editors share each layer; the next layer waits for this one
      await Promise.all(
        room.windows.map(async (w, wi) => {
          for (let k = wi; k < 50 && layer * 50 + k < MAT; k += 4) {
            await place(w, "mat", matPose(layer * 50 + k), room.windows[(wi + 1) % 4]!);
            await sleep(450);
          }
        }),
      );
    }
  }),
);
mark("settle-mat");
await sleep(4000);

mark("rain");
const logins: number[] = [];
let busy = 0;
const loginStorm = (async () => {
  if (process.env.NO_LOGINS) return;
  await sleep(1500);
  await Promise.all(
    rooms.flatMap((room) =>
      room.clients.slice(0, 3).map(async (c) => {
        const t0 = performance.now();
        const r = await new Client(base).login(c.user!.handle, "correct horse battery");
        if (r.status === 503) busy++;
        else logins.push(performance.now() - t0);
      }),
    ),
  );
})();
await Promise.all(
  rooms.map(async (room) =>
    Promise.all(
      room.windows.map(async (w, wi) => {
        for (let k = wi; k < RAIN; k += 4) {
          const a = (k * 2.399) % (2 * Math.PI);
          const rr = 2 + (k % 7) * 1.6;
          await place(w, "rain", { p: [Math.cos(a) * rr, 40 + (k % 9) * 4, Math.sin(a) * rr], q: k % 2 ? ALONG_X : ALONG_Z }, room.windows[(wi + 1) % 4]!);
          await sleep(450);
        }
      }),
    ),
  ),
);
await loginStorm;
mark("settle-rain");
const settleStart = performance.now();
const rainAt = phaseMarks.find((p) => p.name === "rain")!.t;
await Promise.all(
  rooms.map(async (room) => {
    const w = room.windows[0]!;
    // the last status received after the rain began must be "saved"
    for (;;) {
      const latest = [...w.messages].reverse().find((m) => m.type === "save.status" && m.receivedAt > rainAt);
      if (latest?.save === "saved") return;
      await sleep(100);
      if (performance.now() - settleStart > 60_000) return;
    }
  }),
);
const settleMs = performance.now() - settleStart;
mark("snapshots");
const snapMs: number[] = [];
await Promise.all(
  rooms.map(async (room) => {
    const t0 = performance.now();
    const r = await room.windows[0]!.result(room.windows[0]!.command("snapshot.create", { title: "Capacity snapshot" }));
    if (r.outcome === "accepted") snapMs.push(r.receivedAt - t0);
    else rejected["snapshot:" + r.code] = (rejected["snapshot:" + r.code] ?? 0) + 1;
  }),
);
mark("done");
ghosts = false;
await Promise.all(ghostLoops);
await sleep(1000);
sampling = false;
await sampler;
for (const room of rooms) for (const w of room.windows) w.close();

const inPhase = (name: string, next: string) => {
  const a = phaseMarks.find((p) => p.name === name)!.t;
  const b = phaseMarks.find((p) => p.name === next)!.t;
  const xs = samples.filter((s) => s.t >= a && s.t <= b);
  return { samples: xs.length, rssMaxMiB: Math.max(...xs.map((s) => s.rss)), heapsMaxMiB: Math.max(...xs.map((s) => s.heap)), workerHeapTotalMaxMiB: Math.max(...xs.map((s) => s.heapTotal)), arrayBuffersMaxMiB: Math.max(...xs.map((s) => s.ab)), passP95MaxMs: Math.max(...xs.map((s) => s.passP95)), passMaxMs: Math.max(...xs.map((s) => s.passMax)), loopP99MaxMs: Math.max(...xs.map((s) => s.loopP99)) };
};
const final = samples[samples.length - 1]!;
console.log(
  JSON.stringify(
    {
      base,
      rooms: ROOMS,
      sessionsPerRoom: 4,
      sticksAtEnd: final.sticks,
      commandAckMs: Object.fromEntries(Object.entries(ack).map(([k, v]) => [k, summary(v)])),
      visibleToOtherSessionMs: summary(seen),
      rejected,
      loginMs: summary(logins),
      loginBusy: busy,
      settleAfterRainMs: Math.round(settleMs),
      snapshotAckMs: summary(snapMs),
      server: { mat: inPhase("mat", "settle-mat"), rain: inPhase("rain", "settle-rain"), settle: inPhase("settle-rain", "done"), overloadEvents: final.overloads },
      rssMaxOverallMiB: Math.max(...samples.map((s) => s.rss)),
    },
    null,
    1,
  ),
);
process.exit(0);
