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
  },
});
