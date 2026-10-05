// Drives a short real two-person session against a running app so its
// server log can be narrated (OPS-04). Every line in the resulting log comes
// from these actual actions; nothing is written by hand.
//   APP_URL=http://localhost:8080 node scripts/demo-logs.ts
import { Client, Window, sleep } from "../spec/helpers.ts";

const base = process.env.APP_URL ?? "http://localhost:8080";
const FLAT: [number, number, number, number] = [0, 0, 0, 1];
const UP: [number, number, number, number] = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
const ana = await new Client(base).register("Ana");
const ben = await new Client(base).register("Ben");
const workId = await ana.createWork("Demo bridge");
const token = (await ana.req("POST", `/api/works/${workId}/invite`)).body.path.split("token=")[1];
await ben.req("POST", "/api/invites/accept", { token });
const a = await Window.open(ana, workId);
const b = await Window.open(ben, workId);
const settled = (w: Window) => w.waitFor((m) => m.type === "save.status" && m.save === "saved", 20_000);
a.send({ type: "draft.start", seq: 1, epoch: a.snapshot.epoch, pose: { p: [-3, 4.1, 0], q: UP } });
await a.result(a.command("place", { pose: { p: [-3, 4.005, 0], q: UP } }));
await b.result(b.command("place", { pose: { p: [3, 4.005, 0], q: UP } }));
await settled(a);
// Ben tries to put a stick straight through Ana's pillar: rejected
await b.result(b.command("place", { pose: { p: [-3, 4, 0], q: FLAT } }));
await b.result(b.command("place", { pose: { p: [0, 8.51, 0], q: FLAT } }));
await settled(a);
const v = await a.result(a.command("snapshot.create", { title: "Bridge" }));
await a.result(a.command("push.prepare", {}));
const s = (await ana.state(workId)).body;
await a.result(a.command("push.confirm", { stickId: s.sticks[0].id, point: [-2.5, 7, 0], direction: [1, 0, 0] }));
await a.waitFor((m) => m.type === "room.mode" && m.mode === "push-review", 20_000);
await a.result(a.command("restore", { snapshotId: v.snapshotId }));
await sleep(300);
a.close();
b.close();
await sleep(300);
console.log(`demo done: work ${workId}`);
process.exit(0);
