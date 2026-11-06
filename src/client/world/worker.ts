// The world worker: fetches and validates the manifest, decodes landmark and
// terrain assets off the main thread, and transfers typed arrays back.
// Requests carry ids; a cancelled id's result is dropped here and again on the
// main thread (stale results are never applied).
/// <reference lib="webworker" />
import { parseManifest, type WorldManifest } from "../../world/manifest.ts";
import { chunkFromTerrain, detailToCells, farToChains, type CellArrays, type ChainArrays } from "./decode.ts";

declare const self: DedicatedWorkerGlobalScope;

export type WorkerRequest =
  | { type: "manifest"; id: number; base: string; recipeVersion: string }
  | { type: "far"; id: number; base: string; landmark: string; path: string; hash: string; position: number[]; yaw: number }
  | { type: "detail"; id: number; base: string; landmark: string; path: string; hash: string; position: number[]; yaw: number; cell: number }
  | { type: "terrain"; id: number; base: string; path: string; hash: string }
  | { type: "chunk"; id: number; index: number }
  | { type: "chunks"; id: number }
  | { type: "cancel"; id: number };

export type WorkerResponse =
  | { type: "manifest"; id: number; manifest: WorldManifest }
  | { type: "far"; id: number; landmark: string; chains: ChainArrays; bytes: number }
  | { type: "detail"; id: number; landmark: string; cells: CellArrays[]; count: number; bytes: number }
  | { type: "terrain"; id: number; bytes: number }
  | { type: "chunk"; id: number; index: number; heights: Float32Array }
  | { type: "chunks"; id: number; heights: Float32Array; per: number }
  | { type: "error"; id: number; message: string };

const cancelled = new Set<number>();
/** Requests in progress: a cancel for anything else (already answered) is ignored, so `cancelled` can't grow. */
const active = new Set<number>();
let manifest: WorldManifest | null = null;
let terrain: ArrayBuffer | null = null;

async function fetchBytes(url: string, expectHash?: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (expectHash) {
    // content hash check (FNV-1a over the bytes) — rejects a truncated or mismatched file
    const b = new Uint8Array(buf);
    let h = 0x811c9dc5;
    for (let i = 0; i < b.length; i++) {
      h ^= b[i]!;
      h = Math.imul(h, 0x01000193);
    }
    const got = (h >>> 0).toString(16).padStart(8, "0");
    if (got !== expectHash) throw new Error(`${url}: hash ${got}, expected ${expectHash}`);
  }
  return buf;
}

const post = (msg: WorkerResponse, transfer: Transferable[] = []): void => {
  active.delete(msg.id);
  if (cancelled.has(msg.id)) {
    cancelled.delete(msg.id);
    return;
  }
  self.postMessage(msg, transfer);
};

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  if (m.type === "cancel") {
    if (active.has(m.id)) cancelled.add(m.id);
    return;
  }
  active.add(m.id);
  try {
    if (m.type === "manifest") {
      const res = await fetch(`${m.base}manifest.json`, { credentials: "same-origin", cache: "no-cache" });
      if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
      manifest = parseManifest(await res.json(), m.recipeVersion);
      post({ type: "manifest", id: m.id, manifest });
    } else if (m.type === "far") {
      const buf = await fetchBytes(`${m.base}${m.path}`, m.hash);
      if (cancelled.has(m.id)) {
        cancelled.delete(m.id);
        active.delete(m.id);
        return;
      }
      const chains = farToChains(buf, { position: m.position, yaw: m.yaw });
      post({ type: "far", id: m.id, landmark: m.landmark, chains, bytes: buf.byteLength }, [chains.pos.buffer, chains.quat.buffer, chains.scale.buffer]);
    } else if (m.type === "detail") {
      // one detail decode at a time: the main thread never asks for a second before the first is installed
      let buf: ArrayBuffer | null = await fetchBytes(`${m.base}${m.path}`, m.hash);
      if (cancelled.has(m.id)) {
        cancelled.delete(m.id);
        active.delete(m.id);
        return;
      }
      const bytes = buf.byteLength;
      const { cells, count } = detailToCells(buf, { position: m.position, yaw: m.yaw }, m.cell);
      buf = null; // the fetched bytes are not kept: an evicted landmark is fetched again (HTTP-cached, immutable)
      const transfer: Transferable[] = [];
      for (const c of cells) {
        for (const s of c.stocks) transfer.push(s.pos.buffer, s.quat.buffer, s.seed.buffer);
        transfer.push(c.chains.pos.buffer, c.chains.quat.buffer, c.chains.scale.buffer);
      }
      post({ type: "detail", id: m.id, landmark: m.landmark, cells, count, bytes }, transfer);
    } else if (m.type === "terrain") {
      terrain = await fetchBytes(`${m.base}${m.path}`, m.hash);
      post({ type: "terrain", id: m.id, bytes: terrain.byteLength });
    } else if (m.type === "chunks") {
      // the whole heightfield in one transfer: chunk k occupies [k·per, (k + 1)·per)
      if (!terrain || !manifest) throw new Error("terrain not loaded");
      const t = manifest.terrain;
      const per = (t.n + 1) * (t.n + 1);
      const src = new Uint16Array(terrain);
      const heights = new Float32Array(src.length);
      for (let i = 0; i < src.length; i++) heights[i] = src[i]! / t.heightScale + t.heightMin;
      post({ type: "chunks", id: m.id, heights, per }, [heights.buffer]);
    } else if (m.type === "chunk") {
      if (!terrain || !manifest) throw new Error("terrain not loaded");
      const t = manifest.terrain;
      const heights = chunkFromTerrain(terrain, m.index, t.n, t.heightMin, t.heightScale);
      post({ type: "chunk", id: m.id, index: m.index, heights }, [heights.buffer]);
    }
  } catch (err) {
    post({ type: "error", id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};
