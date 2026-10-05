// SYNC-04 measurement: time from editor A sending a placement to session B
// receiving the added stick, and to A receiving its command result, over N
// accepted changes. Both clients run in this process (one clock).
//   APP_URL=http://localhost:8080 node scripts/measure/visibility.ts [N]
import { performance } from "node:perf_hooks";
import { Client, Window } from "../../spec/helpers.ts";

const base = process.env.APP_URL ?? "http://localhost:8080";
const N = Number(process.argv[2] ?? 40);
const owner = await new Client(base).register("Measure A");
const workId = await owner.createWork("Visibility measurement");
const token = (await owner.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
const other = await new Client(base).register("Measure B");
await other.req("POST", "/api/invites/accept", { token });
const a = await Window.open(owner, workId);
const b = await Window.open(other, workId);
const ROT90: [number, number, number, number] = [0, -Math.SQRT1_2, 0, Math.SQRT1_2]; // long axis along Z
const visible: number[] = [];
const acked: number[] = [];
for (let i = 0; i < N; i++) {
  const x = -15 + (i % 25) * 1.2;
  const z = i < 25 ? -5 : 5;
  const t0 = performance.now();
  const id = a.command("place", { pose: { p: [x, 0.505, z], q: ROT90 } });
  let tAck = 0;
  let tSeen = 0;
  const res = await a.result(id);
  tAck = res.receivedAt;
  if (res.outcome === "accepted") {
    // arrival time is stamped on receipt, so the order of the two messages doesn't matter
    const seen = await b.waitFor((m) => m.type === "sticks.added" && m.sticks.some((s: { id: string }) => s.id === res.stickId), 15_000);
    tSeen = seen.receivedAt;
  }
  if (res.outcome !== "accepted") {
    console.error("rejected", res.code, res.message);
    await new Promise((r) => setTimeout(r, (res.retryAfterMs ?? 600) + 50));
    i--;
    continue;
  }
  acked.push(tAck - t0);
  visible.push(tSeen - t0);
  await new Promise((r) => setTimeout(r, 520)); // stay under the 2 commands/s limit
}
const pct = (xs: number[], p: number): number => [...xs].sort((x, y) => x - y)[Math.ceil((xs.length - 1) * p)]!;
const fmt = (xs: number[]) => ({ n: xs.length, p50: +pct(xs, 0.5).toFixed(1), p95: +pct(xs, 0.95).toFixed(1), max: +Math.max(...xs).toFixed(1) });
console.log(JSON.stringify({ base, visibleToOtherSessionMs: fmt(visible), commandAckMs: fmt(acked) }, null, 1));
a.close();
b.close();
