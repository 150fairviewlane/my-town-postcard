import { defineConfig, devices } from "@playwright/test";

// Visual regression tests for the ad templates.
// The localspot dev server is expected to already be running (Replit workflow).
// To run against a different host: PLAYWRIGHT_BASE_URL=http://localhost:5173 pnpm test:ads
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:80";

export default defineConfig({
  testDir: "./tests",
  // Each fixture×template×size combo runs as a separate test — keep them parallel.
  fullyParallel: true,
  // 1 worker by default in Replit (CPU constrained); user can override with --workers.
  workers: process.env.CI ? 2 : 1,
  // IMPORTANT: keep these OUT of the artifact dir. Vite watches everything
  // under artifacts/localspot/ and will trigger HMR page reloads on every
  // trace/screenshot file Playwright writes mid-run, which causes the
  // body[data-ready=1] selector to time out.
  reporter: [["list"], ["html", { outputFolder: "/tmp/playwright-report-localspot", open: "never" }]],
  outputDir: "/tmp/playwright-results-localspot",
  use: {
    baseURL: BASE_URL,
    // Disable animations + caret blink for deterministic screenshots
    launchOptions: {
      args: ["--font-render-hinting=none"],
    },
    viewport: { width: 800, height: 700 },
    trace: "retain-on-failure",
    screenshot: "off",
    video: "off",
  },
  expect: {
    toHaveScreenshot: {
      // Allow a small tolerance for sub-pixel font antialiasing differences across machines.
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
      animations: "disabled",
      caret: "hide",
    },
  },
  // Snapshot path: tests/screenshots/<spec>/<test-name>.png
  snapshotPathTemplate: "tests/screenshots/{arg}{ext}",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
