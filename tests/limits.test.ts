// Account limits at their boundaries (WORLD-04, src/shared/config.ts LIMITS): owned works (20, counting archived and
// trashed works; only permanent deletion frees a slot) and favorites (100). Below, at and over each limit; the
// refusal's code and message; who the limit applies to; simultaneous requests at the boundary; and recovery once a
// permitted slot is freed. Each test runs its own server on a disposable data directory, so nothing touches real
// data and the spec run's signup budget is unaffected.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LIMITS } from "../src/shared/config.ts";
import { Client, Window, sleep } from "../spec/helpers.ts";

const dirs: string[] = [];
const procs: ChildProcess[] = [];
afterAll(() => {
  for (const p of procs) p.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

let nextPort = 19300 + Math.floor(Math.random() * 500);
async function startServer(): Promise<string> {
  const dataDir = mkdtempSync(join(tmpdir(), "stillwood-limits-"));
  dirs.push(dataDir);
  const port = nextPort++;
  const proc = spawn(process.execPath, [process.env.SERVER_ENTRY ?? "src/server/main.ts"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ENABLE_TEST_HOOKS: "1", NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  procs.push(proc);
  const logs: string[] = [];
  proc.stdout!.on("data", (d) => logs.push(String(d)));
  proc.stderr!.on("data", (d) => logs.push(String(d)));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/readyz`)).ok) return url;
    } catch {
      // not up
    }
    await sleep(100);
  }
  throw new Error(`server did not start: ${logs.join("")}`);
}

const create = (c: Client, title: string) => c.req("POST", "/api/works", { title });

describe("owned works per account", () => {
  it(`allows ${LIMITS.ownedWorksPerAccount}, refuses the next with LIMIT; archived and trashed still count; permanent deletion frees a slot`, async () => {
    const url = await startServer();
    const owner = await new Client(url).register("Owner");
    const ids: string[] = [];
    for (let i = 0; i < LIMITS.ownedWorksPerAccount; i++) {
      const r = await create(owner, `Work ${i + 1}`);
      expect(r.status, `work ${i + 1}: ${JSON.stringify(r.body)}`).toBe(200);
      ids.push(r.body.id);
    }
    // over the limit: refused, explained, nothing created
    const over = await create(owner, "One too many");
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("LIMIT");
    expect(over.body.error.message).toContain(`You own ${LIMITS.ownedWorksPerAccount} works`);
    expect(over.body.error.message).toContain("only deleting a work permanently frees a slot");
    const list = (await owner.req("GET", "/api/works")).body.works.map((w: { title: string }) => w.title);
    expect(list).not.toContain("One too many");
    // archiving one and trashing another frees nothing
    expect((await owner.req("POST", `/api/works/${ids[0]}/archive`, { archived: true })).status).toBe(200);
    expect((await owner.req("POST", `/api/works/${ids[1]}/trash`)).status).toBe(200);
    expect((await create(owner, "Still too many")).body.error?.code).toBe("LIMIT");
    // a collaborator's membership doesn't count against them: an editor at no owned works can create
    const ed = await new Client(url).register("Editor");
    const token = (await owner.req("POST", `/api/works/${ids[2]}/invite`)).body.path.split("token=")[1];
    expect((await ed.req("POST", "/api/invites/accept", { token })).status).toBe(200);
    expect((await create(ed, "Editor's own")).status).toBe(200);
    // permanently deleting the trashed work frees exactly one slot
    const title = (await owner.req("GET", "/api/trash")).body.works.find((w: { id: string }) => w.id === ids[1]).title;
    expect((await owner.req("POST", `/api/works/${ids[1]}/delete-permanently`, { title })).status).toBe(200);
    const again = await create(owner, "Freed slot");
    expect(again.status).toBe(200);
    expect((await create(owner, "And over again")).body.error?.code).toBe("LIMIT");
  }, 120_000);

  it("two creates sent at once at one below the limit: exactly one succeeds", async () => {
    const url = await startServer();
    const owner = await new Client(url).register("Racer");
    for (let i = 0; i < LIMITS.ownedWorksPerAccount - 1; i++) expect((await create(owner, `W${i}`)).status).toBe(200);
    const [a, b] = await Promise.all([create(owner, "Race A"), create(owner, "Race B")]);
    const ok = [a, b].filter((r) => r.status === 200);
    const refused = [a, b].filter((r) => r.body?.error?.code === "LIMIT");
    expect(ok).toHaveLength(1);
    expect(refused).toHaveLength(1);
    const owned = (await owner.req("GET", "/api/works")).body.works.filter((w: { role: string }) => w.role === "owner");
    expect(owned).toHaveLength(LIMITS.ownedWorksPerAccount);
  }, 120_000);
});

describe("favorites per account", () => {
  it(`allows ${LIMITS.favoritesPerAccount}, refuses the next with LIMIT, stays idempotent at the limit, and removing one frees a slot`, async () => {
    const url = await startServer();
    const owner = await new Client(url).register("Curator");
    const fan = await new Client(url).register("Fan");
    // enough public exhibits: each work holds up to LIMITS.exhibitsPerWork, all from one settled (empty) version
    const need = LIMITS.favoritesPerAccount + 1;
    const exhibits: string[] = [];
    const framing = { yaw: 0, pitch: 1, distance: 40, targetY: 2 };
    while (exhibits.length < need) {
      const workId = (await create(owner, `Gallery ${exhibits.length}`)).body.id as string;
      const w = await Window.open(owner, workId);
      await w.joinLive(workId);
      const snap = await w.result(w.command("snapshot.create", { title: "Empty table" }));
      expect(snap.outcome, JSON.stringify(snap)).toBe("accepted");
      w.close();
      for (let k = 0; k < LIMITS.exhibitsPerWork && exhibits.length < need; k++) {
        const r = await owner.req("POST", `/api/works/${workId}/exhibits`, { snapshotId: snap.snapshotId, title: `Exhibit ${exhibits.length}`, framing });
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        exhibits.push(r.body.id);
      }
    }
    for (let i = 0; i < LIMITS.favoritesPerAccount; i++) {
      const r = await fan.req("PUT", `/api/favorites/${exhibits[i]}`);
      expect(r.status, `favorite ${i + 1}: ${JSON.stringify(r.body)}`).toBe(200);
    }
    const over = await fan.req("PUT", `/api/favorites/${exhibits[LIMITS.favoritesPerAccount]}`);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("LIMIT");
    expect(over.body.error.message).toContain(`You have ${LIMITS.favoritesPerAccount} favorites`);
    // favoriting one already saved at the limit is still accepted (idempotent), not refused
    expect((await fan.req("PUT", `/api/favorites/${exhibits[0]}`)).status).toBe(200);
    expect((await fan.req("GET", "/api/favorites")).body.favorites).toHaveLength(LIMITS.favoritesPerAccount);
    // another account's favorites are its own: the curator can still favorite
    expect((await owner.req("PUT", `/api/favorites/${exhibits[LIMITS.favoritesPerAccount]}`)).status).toBe(200);
    // removing one frees a slot for the refused exhibit
    expect((await fan.req("DELETE", `/api/favorites/${exhibits[0]}`)).status).toBe(200);
    expect((await fan.req("PUT", `/api/favorites/${exhibits[LIMITS.favoritesPerAccount]}`)).status).toBe(200);
    expect((await fan.req("GET", "/api/favorites")).body.favorites).toHaveLength(LIMITS.favoritesPerAccount);
  }, 240_000);
});
