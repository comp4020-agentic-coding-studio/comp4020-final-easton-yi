// One-off Crit 10 diagnostic config (docs/evidence/crit-10-verification.md, D-2).
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.APP_URL ?? "http://localhost:8099", launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
