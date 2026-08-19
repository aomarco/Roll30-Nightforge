import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "phase11.spec.js",
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
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
