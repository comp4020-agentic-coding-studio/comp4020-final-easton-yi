import { defineConfig, devices } from "@playwright/test";

// Browser interaction tests through the real controls, against a running
// server (APP_URL, default the local dev port). WebGL runs on SwiftShader in
// headless Chromium, so frames are real renders, if slow.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:8099",
    trace: "retain-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
