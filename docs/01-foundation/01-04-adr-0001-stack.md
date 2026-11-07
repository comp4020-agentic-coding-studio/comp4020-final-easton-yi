# ADR-0001 · Stack: one Node process, one coordinator worker, SQLite on the volume

Status: accepted (P0, 2026-10-05). Revisit with a new ADR if outgrown.

## Context

The course fixes the deployment shape (`fly.toml`): one shared-cpu-1x machine,
**256 MB of memory**, one volume at `/data`, HTTP on `0.0.0.0:$PORT`, no
separate database server. The brief needs an authoritative server physics
world per active work (PHYS-01), acknowledged placements that survive a crash
(SAVE-02), real-time shared ghosts (SYNC-01) and a 3D client with precise
placement (PLACE-*).

The repository shipped only a busybox placeholder and a TypeScript/Vitest
harness pinned to Node 24.21.0 and pnpm 11.9.0 by `mise.toml`.

## Decision

| Layer | Choice (exact version) | Why |
| --- | --- | --- |
| Runtime | Node 24.21.0 (course pin), pnpm 11.9.0 | Keep the course toolchain the harness already uses |
| Physics | `@dimforge/rapier3d-compat` **0.19.3** | Native world snapshots, signed contact queries, CCD, sleeping. 0.21.0 was rejected on measured memory (M-001) |
| Persistence | `better-sqlite3` 13.0.3, WAL, `synchronous=FULL`, on `/data` | One transactional source of truth on the only durable storage |
| HTTP | `fastify` 5.12.5 + `@fastify/cookie`, `@fastify/static` | Pages, API and WebSocket upgrade on one origin |
| Transport | `ws` 8.22.0 | Ephemeral ghosts and durable command results over one socket |
| Validation | `zod` 4.6.5 | Every inbound message is untrusted |
| Client | React 19.3 + Vite 8.3, Three.js 0.186.1 | Semantic DOM controls around a directly owned 3D viewport |
| README | `markdown-it` 15.0.2, HTML disabled | Server-rendered `/readme/` in the initial HTML |
| Browser tests | `@playwright/test` 1.63.0 | Real input through real controls in separate contexts |

The process layout is the main thread (HTTP, WebSocket, async scrypt) plus
**one coordinator worker thread**, which owns the single SQLite connection and
every live Rapier world. All room mutations, physics ticks and snapshot
transactions run in coordinator order, so a transaction never interleaves with
a tick in the same room.

Production runs JavaScript bundled by esbuild (`dist/server`). Node's built-in
type stripping would cost ~20 MiB RSS per isolate, and there are two isolates.

## Consequences

- Memory is the binding constraint. Rapier's compiled code dominates RSS
  (M-001). The worker isolate, scrypt (64 MiB per hash at N=2^16) and three
  worlds all share 256 MB. Hashing is limited to one at a time, and the full
  budget must be measured under load before the capacity in WORLD-04 can be
  claimed.
- A synchronous SQLite write of a ~0.5 MB native snapshot sits inside the
  coordinator's ordering. This keeps correctness simple, at the cost of a
  latency hit to every room on each commit. It must be measured (P3/P5).
- There is only one authority. Scaling past one machine would need a
  different design; the course setup does not allow one anyway.
- Rejected: client-side physics with server reconciliation (violates
  PHYS-01); an external database or Redis (outside the one-machine/one-volume
  setup); a command log with deterministic replay as the source of truth
  (more fragile across engine versions than full snapshots at this scale; see
  ADR-0002).
