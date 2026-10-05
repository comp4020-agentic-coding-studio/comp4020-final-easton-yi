// Bundles the server and its coordinator worker to plain JavaScript so
// production doesn't pay for TypeScript stripping in each isolate (M-001).
// Dependencies stay in node_modules (better-sqlite3 is native).
import { build } from "esbuild";

await build({
  entryPoints: { main: "src/server/main.ts", "core/coordinator": "src/server/core/coordinator.ts" },
  outdir: "dist/server",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});
