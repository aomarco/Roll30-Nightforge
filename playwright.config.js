import { defineConfig } from "@playwright/test";

const snapshotPathTemplate = process.platform === "win32"
  ? "{testDir}/__screenshots__/{arg}{ext}"
  : "{testDir}/__screenshots__/linux/{arg}{ext}";

export default defineConfig({
  testDir: "./tests",
  testMatch: "phase11.spec.js",
  timeout: 45_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: process.platform === "win32" ? 0 : 0.001,
    },
  },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  snapshotPathTemplate,
  use: {
    baseURL: "http://127.0.0.1:5311",
    browserName: "chromium",
    colorScheme: "dark",
    locale: "en-AU",
    timezoneId: "Australia/Sydney",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5311 --strictPort",
    url: "http://127.0.0.1:5311",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
