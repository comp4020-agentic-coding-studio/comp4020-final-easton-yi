import { defineConfig } from "vitest/config";

// Suites that start the production bundle (dist/server/main.js) as real
// servers on 127.0.0.1 with disposable databases, so they need `pnpm build`
// first; `pnpm test:integration` does both. Kept out of test:unit, which needs
// no build.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
