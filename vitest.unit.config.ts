import { defineConfig } from "vitest/config";

// Focused domain tests (physics fixtures, geometry, placement maths, restart
// scenarios). These run the real pinned engine and real processes; the course
// harness in vitest.config.ts keeps checking the running app over HTTP.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // build-dependent suites run with `pnpm test:integration` (vitest.integration.config.ts)
    exclude: ["tests/integration/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Bounded concurrency (docs/evidence/world/memory-incident.md): the default is one worker per core,
    // and every world suite builds all twenty landmarks in its own worker. Two forks keep the peak near 1 GiB.
    pool: "forks",
    maxWorkers: 2,
  },
});
