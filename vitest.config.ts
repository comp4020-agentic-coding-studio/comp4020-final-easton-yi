import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // The product specs share one running app with a fixed number of live
    // rooms (WORLD-04), so files run one at a time rather than competing.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
