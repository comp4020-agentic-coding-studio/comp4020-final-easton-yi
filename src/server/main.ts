// Main thread: HTTP pages and API, the WebSocket gateway and password
// hashing. Durable state and physics live in the coordinator worker; every
// privileged request is re-checked there (AUTH-02).
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { WebSocketServer, type WebSocket } from "ws";
import { Worker } from "node:worker_threads";
import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { z } from "zod";
import MarkdownIt from "markdown-it";
import { AppError, isAppError } from "./errors.ts";
import { log } from "./log.ts";
import { checkPassword, digest, dummyHash, hashPassword, newRecoveryCode, newToken, normaliseRecoveryCode, verifyPassword } from "./auth.ts";
import { thumbnailSvg } from "./thumbnail.ts";
import { TokenBucket } from "./core/util.ts";
import { AUTH, TRANSPORT } from "../shared/config.ts";
import { ClientMessageS, CommandS, Description, DisplayName, FramingS, Handle, Title, Uuid } from "../shared/protocol.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, existsSync(join(here, "../../package.json")) ? "../.." : "../../..");
const production = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT ?? 8080);
const dataDir = resolve(process.env.DATA_DIR ?? (production ? "/data" : join(root, ".data")));
const testHooks = !production && process.env.ENABLE_TEST_HOOKS === "1";
const secureCookies = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "1" : production;
const trustFlyHeader = !!process.env.FLY_APP_NAME;

// A missing or unwritable mount is a startup error, never a silent /tmp.
if (production) {
  try {
    if (!statSync(dataDir).isDirectory()) throw new Error("not a directory");
    accessSync(dataDir, constants.W_OK);
  } catch (e) {
    log({ event: "startup.fail", level: "error", reason: `data directory ${dataDir} is not a writable mount: ${String(e)}` });
    process.exit(1);
  }
}

// ---------------------------------------------------------------- coordinator RPC

const workerFile = existsSync(join(here, "core/coordinator.js")) ? join(here, "core/coordinator.js") : join(here, "core/coordinator.ts");
// Bounded worker heap so V8 collects frame/snapshot churn before RSS grows
// past the 256 MB machine (M-004). Overridable for measurements.
const workerOld = Number(process.env.WORKER_MAX_OLD_MB ?? (production ? 48 : 0));
const workerYoung = Number(process.env.WORKER_MAX_YOUNG_MB ?? (production ? 8 : 0));
const worker = new Worker(workerFile, {
  workerData: { dataDir, testHooks },
  resourceLimits: { ...(workerOld ? { maxOldGenerationSizeMb: workerOld } : {}), ...(workerYoung ? { maxYoungGenerationSizeMb: workerYoung } : {}) },
});
let ready = false;
let shuttingDown = false;
let rpcSeq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
const sockets = new Map<string, WebSocket>();

worker.on("message", (m: any) => {
  if (m.kind === "ready") {
    ready = true;
  } else if (m.kind === "reply") {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (!p) return;
    if (m.ok) p.resolve(m.result);
    else p.reject(new AppError(m.error.code, m.error.message, m.error.retryAfterMs));
  } else if (m.kind === "send") {
    const coalescible = m.data.startsWith('{"type":"world.frame"') || m.data.startsWith('{"type":"draft.pose"');
    for (const id of m.conns as string[]) {
      const ws = sockets.get(id);
      if (!ws || ws.readyState !== ws.OPEN) continue;
      if (ws.bufferedAmount > TRANSPORT.closeBufferedBytes) {
        ws.close(4008, "resync");
        continue;
      }
      if (coalescible && ws.bufferedAmount > TRANSPORT.coalesceBufferedBytes) continue;
      ws.send(m.data);
    }
  } else if (m.kind === "close") {
    sockets.get(m.connId)?.close(m.code, m.reason);
  }
});
worker.on("error", (e) => log({ event: "coordinator.error", level: "error", error: String(e), stack: e.stack }));
worker.on("exit", (code) => {
  ready = false;
  for (const p of pending.values()) p.reject(new AppError("BUSY", "The server is restarting."));
  pending.clear();
  if (!shuttingDown) {
    // Never keep accepting mutations against a dead authority: exit and let
    // the platform restart the process from the durable state.
    log({ event: "coordinator.exit", level: "error", exitCode: code });
    process.exit(1);
  }
});

const rpc = <T = any>(method: string, ...args: unknown[]): Promise<T> => {
  if (!ready && method !== "health") return Promise.reject(new AppError("BUSY", "The server is starting up. Try again in a moment.", 1000));
  const id = ++rpcSeq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker.postMessage({ kind: "rpc", id, method, args });
  });
};

// ---------------------------------------------------------------- HTTP basics

const app = Fastify({ logger: false, bodyLimit: 64 * 1024, trustProxy: false });
await app.register(cookie);

const SESSION_COOKIE = "sw_session";
interface Session {
  userId: string;
  handle: string;
  displayName: string;
  csrf: string;
  digest: string;
}

const clientIp = (req: FastifyRequest): string =>
  (trustFlyHeader && (req.headers["fly-client-ip"] as string | undefined)) || req.socket.remoteAddress || "unknown";

const sameOrigin = (req: { headers: Record<string, string | string[] | undefined> }): boolean => {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

const readSession = async (req: FastifyRequest): Promise<Session | null> => {
  const token = req.cookies[SESSION_COOKIE];
  if (!token || token.length > 100) return null;
  const d = digest(token);
  const s = await rpc<Omit<Session, "digest"> | null>("session.get", d);
  return s ? { ...s, digest: d } : null;
};

const requireSession = async (req: FastifyRequest): Promise<Session> => {
  const s = await readSession(req);
  if (!s) throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
  return s;
};

const setSessionCookie = (reply: FastifyReply, token: string): void => {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH.sessionAbsoluteMs / 1000,
  });
};

const startSession = async (reply: FastifyReply, userId: string): Promise<string> => {
  const token = newToken();
  const csrf = newToken();
  await rpc("session.create", userId, digest(token), csrf);
  setSessionCookie(reply, token);
  return csrf;
};

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError("BAD_REQUEST", r.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; "));
  return r.data;
};

const authLimiters = new Map<string, TokenBucket>();
const authLimit = (kind: keyof typeof AUTH.rate, key: string): void => {
  const [burst, perMinute] = AUTH.rate[kind]!;
  key = `${kind}:${key}`;
  const b = authLimiters.get(key) ?? new TokenBucket(perMinute / 60, burst);
  authLimiters.set(key, b);
  const r = b.take();
  if (!r.ok) throw new AppError("RATE_LIMITED", "Too many attempts. Wait a minute and try again.", r.retryAfterMs);
};
setInterval(() => authLimiters.size > 10_000 && authLimiters.clear(), 600_000).unref();

app.addHook("onRequest", async (req, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "same-origin");
  reply.header("X-Frame-Options", "DENY");
  reply.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  if (req.url.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!sameOrigin(req)) throw new AppError("ORIGIN", "Requests must come from this site.");
    if (!req.url.startsWith("/api/auth/") || req.url.startsWith("/api/auth/logout") || req.url.startsWith("/api/auth/recovery-code")) {
      const s = await readSession(req);
      if (s && req.headers["x-csrf-token"] !== s.csrf) throw new AppError("CSRF", "Your session token is missing or out of date. Reload the page.");
      (req as any).session = s;
    }
  }
});

app.setErrorHandler((err, req, reply) => {
  if (isAppError(err)) {
    if (err.retryAfterMs) reply.header("Retry-After", Math.ceil(err.retryAfterMs / 1000));
    reply.status(err.status).send({ error: { code: err.code, message: err.message, retryAfterMs: err.retryAfterMs } });
    return;
  }
  const e = err as { statusCode?: number; message?: string };
  if (e.statusCode && e.statusCode < 500) {
    reply.status(e.statusCode).send({ error: { code: "BAD_REQUEST", message: e.message ?? "Bad request" } });
    return;
  }
  log({ event: "http.error", level: "error", method: req.method, route: req.routeOptions.url, error: String(err) });
  reply.status(500).send({ error: { code: "INTERNAL", message: "Something went wrong on the server." } });
});

const session = async (req: FastifyRequest): Promise<Session> => ((req as any).session as Session | null) ?? requireSession(req);

// ---------------------------------------------------------------- health and README

const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
app.get("/healthz", async () => ({ ok: true }));
app.get("/readyz", async (_req, reply) => {
  try {
    if (!ready || shuttingDown) throw new Error("not ready");
    accessSync(dataDir, constants.W_OK);
    const h = await rpc("health");
    const ms = (ns: number): number => Math.round(ns / 1e4) / 100;
    return { ok: true, ...h, mainHeapMiB: Math.round(process.memoryUsage().heapUsed / 1048576), eventLoopDelayMs: { p50: ms(loopDelay.percentile(50)), p99: ms(loopDelay.percentile(99)), max: ms(loopDelay.max) }, sockets: sockets.size };
  } catch {
    reply.status(503);
    return { ok: false };
  }
});

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
const readmeHtml = (): string => {
  const body = md.render(readFileSync(join(root, "README.md"), "utf8"));
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Stillwood</title><link rel="stylesheet" href="/readme.css"></head><body><header class="readme-top"><a href="/">← Stillwood</a></header><main class="readme">${body}</main></body></html>`;
};
app.get("/readme", async (_req, reply) => reply.redirect("/readme/", 301));
app.get("/readme/", async (_req, reply) => reply.type("text/html; charset=utf-8").header("Cache-Control", "no-cache").send(readmeHtml()));
app.get("/readme.css", async (_req, reply) =>
  reply.type("text/css").send(
    `body{margin:0;background:#F4F1EA;color:#252B26;font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}.readme-top{padding:12px 16px}.readme-top a{color:#2f4a38}.readme{max-width:44rem;margin:0 auto;padding:8px 16px 64px}.readme img{max-width:100%;height:auto}.readme a{color:#2f4a38}.readme code{background:#ebe5d8;padding:0 .2em;border-radius:3px}.readme pre{background:#ebe5d8;padding:12px;overflow:auto}h1,h2,h3{line-height:1.25}`,
  ),
);
// README images are linked relatively (docs/x.png) so they resolve on GitHub and here.
app.get("/readme/docs/:file", async (req, reply) => {
  const file = (req.params as { file: string }).file;
  if (!/^[\w.-]+\.(png|jpe?g|gif|svg|webp)$/i.test(file)) throw new AppError("NOT_FOUND", "Not found");
  const path = join(root, "docs", file);
  if (!existsSync(path)) throw new AppError("NOT_FOUND", "Not found");
  const ext = file.split(".").pop()!.toLowerCase();
  const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" }[ext]!;
  return reply.type(type).send(readFileSync(path));
});

// ---------------------------------------------------------------- accounts

app.get("/api/session", async (req) => {
  const s = await readSession(req);
  return s ? { user: { id: s.userId, handle: s.handle, displayName: s.displayName }, csrf: s.csrf } : { user: null };
});

app.post("/api/auth/register", async (req, reply) => {
  const body = req.body as Record<string, unknown>;
  authLimit("registerPerIp", clientIp(req));
  const handle = parse(Handle, body?.handle);
  const name = parse(DisplayName, body?.displayName);
  const password = checkPassword(body?.password);
  const recoveryCode = newRecoveryCode();
  const pwHash = await hashPassword(password);
  const { id } = await rpc<{ id: string }>("user.create", handle, name, pwHash, digest(normaliseRecoveryCode(recoveryCode)));
  const csrf = await startSession(reply, id);
  return { user: { id, handle, displayName: name }, csrf, recoveryCode };
});

app.post("/api/auth/login", async (req, reply) => {
  const body = req.body as Record<string, unknown>;
  const handle = parse(Handle, body?.handle);
  authLimit("loginPerHandle", handle);
  const password = typeof body?.password === "string" && body.password.length <= AUTH.passwordMax ? body.password : "";
  const user = await rpc<{ id: string; pwHash: string; displayName: string } | null>("user.byHandle", handle);
  const ok = await verifyPassword(password, user?.pwHash ?? (await dummyHash()));
  if (!user || !ok) {
    authLimit("failedLoginPerIp", clientIp(req));
    log({ event: "session.login", outcome: "rejected", code: "BAD_CREDENTIALS" });
    throw new AppError("BAD_CREDENTIALS", "That handle and password don't match.");
  }
  const csrf = await startSession(reply, user.id);
  return { user: { id: user.id, handle, displayName: user.displayName }, csrf };
});

app.post("/api/auth/logout", async (req, reply) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await rpc("session.revoke", digest(token));
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

app.post("/api/auth/recover", async (req, reply) => {
  const body = req.body as Record<string, unknown>;
  authLimit("failedLoginPerIp", clientIp(req));
  const handle = parse(Handle, body?.handle);
  authLimit("recoverPerHandle", handle);
  const code = typeof body?.recoveryCode === "string" ? normaliseRecoveryCode(body.recoveryCode).slice(0, 100) : "";
  const password = checkPassword(body?.newPassword);
  const pwHash = await hashPassword(password);
  const recoveryCode = newRecoveryCode();
  const { id } = await rpc<{ id: string }>("user.recover", handle, digest(code), pwHash, digest(normaliseRecoveryCode(recoveryCode)));
  const csrf = await startSession(reply, id);
  return { csrf, recoveryCode };
});

app.post("/api/auth/recovery-code", async (req) => {
  const s = await session(req);
  const recoveryCode = newRecoveryCode();
  await rpc("user.rotateRecovery", s.userId, digest(normaliseRecoveryCode(recoveryCode)));
  return { recoveryCode };
});

// ---------------------------------------------------------------- works, members, invitations

const id = (req: FastifyRequest, key = "id"): string => parse(Uuid, (req.params as Record<string, string>)[key]);

app.get("/api/works", async (req) => ({ works: await rpc("works.list", (await session(req)).userId) }));
app.post("/api/works", async (req) => {
  const s = await session(req);
  return rpc("works.create", s.userId, parse(Title, (req.body as { title?: unknown })?.title));
});
app.get("/api/works/:id", async (req) => rpc("works.get", (await session(req)).userId, id(req)));
app.patch("/api/works/:id", async (req) => {
  const s = await session(req);
  await rpc("works.rename", s.userId, id(req), parse(Title, (req.body as { title?: unknown })?.title));
  return { ok: true };
});
app.post("/api/works/:id/archive", async (req) => {
  const s = await session(req);
  await rpc("works.archive", s.userId, id(req), parse(z.boolean(), (req.body as { archived?: unknown })?.archived));
  return { ok: true };
});
app.get("/api/collaborations/unavailable", async (req) => ({ works: await rpc("works.unavailable", (await session(req)).userId) }));
app.get("/api/trash", async (req) => ({ works: await rpc("works.trashList", (await session(req)).userId) }));
app.post("/api/works/:id/trash", async (req) => rpc("works.trash", (await session(req)).userId, id(req)));
app.post("/api/works/:id/trash/restore", async (req) => rpc("works.untrash", (await session(req)).userId, id(req)));
// Exact title, no trimming: typing it is the owner's confirmation (SAVE-12).
const PurgeBody = z.object({ title: z.string().max(200) });
app.post("/api/works/:id/delete-permanently", async (req) => {
  const s = await session(req);
  return rpc("works.purge", s.userId, id(req), parse(PurgeBody, req.body).title);
});
app.get("/api/works/:id/state", async (req, reply) => {
  reply.header("Cache-Control", "no-store");
  return rpc("works.state", (await session(req)).userId, id(req));
});

app.get("/api/works/:id/invite", async (req) => ({ invite: await rpc("invite.status", (await session(req)).userId, id(req)) }));
app.post("/api/works/:id/invite", async (req) => {
  const s = await session(req);
  const token = newToken();
  const info = await rpc<{ expiresAt: number; maxUses: number }>("invite.create", s.userId, id(req), digest(token));
  // The secret lives in the URL fragment so it never reaches access logs.
  return { ...info, path: `/join/#token=${token}` };
});
app.delete("/api/works/:id/invite", async (req) => {
  await rpc("invite.revoke", (await session(req)).userId, id(req));
  return { ok: true };
});
const InviteBody = z.object({ token: z.string().min(20).max(100) });
app.post("/api/invites/preview", async (req) => {
  authLimit("invitePreviewPerIp", clientIp(req));
  return rpc("invite.preview", digest(parse(InviteBody, req.body).token));
});
app.post("/api/invites/accept", async (req) => {
  const s = await session(req);
  return rpc("invite.accept", s.userId, digest(parse(InviteBody, req.body).token));
});
app.delete("/api/works/:id/members/:userId", async (req) => {
  await rpc("members.remove", (await session(req)).userId, id(req), id(req, "userId"));
  return { ok: true };
});
app.post("/api/works/:id/leave", async (req) => {
  await rpc("members.leave", (await session(req)).userId, id(req));
  return { ok: true };
});

// ---------------------------------------------------------------- commands (same coordinator handler as the socket)

app.post("/api/commands", async (req, reply) => {
  const s = await session(req);
  const cmd = parse(CommandS, req.body);
  const result = await rpc<{ outcome: string; code?: string }>("command.submit", s.userId, cmd);
  if (testHooks && process.env.CRASH_AT === "after-reply") {
    reply.raw.on("finish", () => setTimeout(() => process.kill(process.pid, "SIGKILL"), 20));
  }
  if (result.outcome === "rejected") {
    const err = new AppError((result.code ?? "BAD_REQUEST") as any, "");
    reply.status(err.status);
  }
  return result;
});
app.get("/api/commands/:commandId", async (req) => rpc("command.query", (await session(req)).userId, id(req, "commandId")));

// ---------------------------------------------------------------- versions, exhibits, favorites

app.get("/api/works/:id/versions", async (req) => ({ versions: await rpc("versions.list", (await session(req)).userId, id(req)) }));
app.get("/api/works/:id/versions/:sid/geometry", async (req) => rpc("versions.geometry", (await session(req)).userId, id(req), id(req, "sid")));
app.delete("/api/works/:id/versions/:sid", async (req) => {
  await rpc("versions.delete", (await session(req)).userId, id(req), id(req, "sid"));
  return { ok: true };
});
app.get("/api/works/:id/exhibits", async (req) => ({ exhibits: await rpc("exhibits.forWork", (await session(req)).userId, id(req)) }));
const PublishBody = z.object({ snapshotId: Uuid, title: Title, description: Description.default(""), framing: FramingS });
app.post("/api/works/:id/exhibits", async (req) => {
  const s = await session(req);
  const b = parse(PublishBody, req.body);
  return rpc("exhibits.publish", s.userId, id(req), b.snapshotId, b.title, b.description.trim(), b.framing);
});
app.post("/api/exhibits/:id/withdraw", async (req) => {
  const s = await session(req);
  await rpc("exhibits.setWithdrawn", s.userId, id(req), parse(z.boolean(), (req.body as { withdrawn?: unknown })?.withdrawn));
  return { ok: true };
});
// Public, revalidated on every use so a withdrawal can't be outlived by a cache (SAVE-07).
app.get("/api/exhibits", async (req, reply) => {
  const q = req.query as { q?: string; offset?: string };
  reply.header("Cache-Control", "no-cache");
  const offset = Math.max(0, Math.min(10_000, Number.parseInt(q.offset ?? "0", 10) || 0));
  return rpc("exhibits.list", (q.q ?? "").slice(0, 80), offset, 24);
});
app.get("/api/exhibits/:id", async (req, reply) => {
  reply.header("Cache-Control", "no-cache");
  return rpc("exhibits.get", id(req));
});
app.get("/api/exhibits/:id/thumbnail.svg", async (req, reply) => {
  const e = await rpc<{ geometry: Parameters<typeof thumbnailSvg>[0] }>("exhibits.get", id(req));
  return reply
    .type("image/svg+xml")
    .header("Cache-Control", "no-cache")
    .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
    .send(thumbnailSvg(e.geometry));
});
app.get("/api/favorites", async (req) => ({ favorites: await rpc("favorites.list", (await session(req)).userId) }));
app.get("/api/favorites/:id", async (req) => ({ favorite: await rpc("favorites.has", (await session(req)).userId, id(req)) }));
app.put("/api/favorites/:id", async (req) => rpc("favorites.set", (await session(req)).userId, id(req), true));
app.delete("/api/favorites/:id", async (req) => rpc("favorites.set", (await session(req)).userId, id(req), false));

if (testHooks) {
  app.post("/api/test/remove-stick", async (req) => {
    const b = req.body as { workId: string; stickId: string };
    await rpc("test.removeStick", b.workId, b.stickId);
    return { ok: true };
  });
  app.post("/api/test/fail-writes", async (req) => {
    await rpc("test.failWrites", !!(req.body as { on: boolean }).on);
    return { ok: true };
  });
  app.get("/api/test/room/:id", async (req) => rpc("test.roomInfo", (req.params as { id: string }).id));
}

app.all("/api/*", async () => {
  throw new AppError("NOT_FOUND", "No such endpoint.");
});

// ---------------------------------------------------------------- pages (SPA shell) and assets

const clientDir = join(root, "dist/client");
if (existsSync(clientDir)) {
  await app.register(fastifyStatic, {
    root: join(clientDir, "assets"),
    prefix: "/assets/",
    immutable: true,
    maxAge: "365d",
    decorateReply: false,
  });
}
const shell = (): string =>
  existsSync(join(clientDir, "index.html"))
    ? readFileSync(join(clientDir, "index.html"), "utf8")
    : `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>Stillwood</title></head><body><main><h1>Stillwood</h1><p>The client hasn't been built. Run <code>pnpm build</code>.</p><p><a href="/readme/">About this app</a></p></main></body></html>`;

const PAGES = [/^\/$/, /^\/works\/$/, /^\/works\/[0-9a-f-]{36}\/$/, /^\/exhibits\/[0-9a-f-]{36}\/$/, /^\/favorites\/$/, /^\/(login|register|recover|account|join)\/$/];
app.setNotFoundHandler(async (req, reply) => {
  const path = req.url.split("?")[0]!.split("#")[0]!;
  if (req.method !== "GET" && req.method !== "HEAD") return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
  if (!path.endsWith("/") && PAGES.some((re) => re.test(path + "/"))) return reply.redirect(path + "/", 301);
  const known = PAGES.some((re) => re.test(path));
  return reply.status(known ? 200 : 404).type("text/html; charset=utf-8").header("Cache-Control", "no-cache").send(shell());
});

// ---------------------------------------------------------------- WebSocket gateway

const wss = new WebSocketServer({ noServer: true, maxPayload: TRANSPORT.inboundMaxBytes, perMessageDeflate: false });

app.server.on("upgrade", async (req, socket, head) => {
  const reject = (status: number): void => {
    socket.write(`HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : "Forbidden"}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };
  try {
    if (!req.url?.startsWith("/ws") || shuttingDown || !ready) return reject(403);
    if (!sameOrigin(req)) return reject(403);
    const token = (req.headers.cookie ?? "")
      .split(";")
      .map((c) => c.trim().split("="))
      .find(([k]) => k === SESSION_COOKIE)?.[1];
    if (!token) return reject(401);
    const d = digest(decodeURIComponent(token));
    const s = await rpc<Omit<Session, "digest"> | null>("session.get", d);
    if (!s) return reject(401);
    wss.handleUpgrade(req, socket, head, (ws) => onSocket(ws, { ...s, digest: d }));
  } catch {
    reject(403);
  }
});

function onSocket(ws: WebSocket, s: Session): void {
  const connId = randomUUID();
  let opened = false;
  const helloTimer = setTimeout(() => !opened && ws.close(4401, "handshake timeout"), 10_000);
  ws.on("message", (data, isBinary) => {
    if (isBinary) return ws.close(4400, "text only");
    let msg: unknown;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return ws.close(4400, "bad json");
    }
    const parsed = ClientMessageS.safeParse(msg);
    if (!parsed.success) {
      ws.send(JSON.stringify({ type: "error", code: "BAD_REQUEST", message: "Malformed message." }));
      return;
    }
    if (!opened) {
      // CSRF proof as the first message; nothing else is accepted before it.
      if (parsed.data.type !== "hello" || parsed.data.csrf !== s.csrf) return ws.close(4401, "handshake");
      opened = true;
      clearTimeout(helloTimer);
      sockets.set(connId, ws);
      void rpc("conn.open", connId, s.userId, s.digest).catch(() => ws.close(1011, "unavailable"));
      return;
    }
    void rpc("conn.message", connId, parsed.data).catch(() => undefined);
  });
  ws.on("close", () => {
    clearTimeout(helloTimer);
    if (sockets.delete(connId)) void rpc("conn.close", connId).catch(() => undefined);
  });
  ws.on("error", () => undefined);
}

// ---------------------------------------------------------------- lifecycle

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  log({ event: "shutdown.start", signal });
  for (const ws of sockets.values()) ws.close(1012, "server restarting");
  try {
    await Promise.race([rpc("shutdown"), new Promise((r) => setTimeout(r, 4000))]);
  } catch (e) {
    log({ event: "shutdown.error", level: "error", error: String(e) });
  }
  await app.close().catch(() => undefined);
  await worker.terminate();
  log({ event: "shutdown.done" });
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await new Promise<void>((resolve) => {
  const check = (): void => (ready ? resolve() : void setTimeout(check, 20));
  check();
});
await app.listen({ host: "0.0.0.0", port: PORT });
log({ event: "server.listen", port: PORT, production, testHooks });
void dummyHash();
