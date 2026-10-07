import { existsSync, readdirSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 5200);
const browsersDir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
// The preinstalled browser build may not match this Playwright's expected revision; point at it directly.
const chromiumPath = `${browsersDir}/chromium`;
const executablePath = existsSync(chromiumPath) ? chromiumPath : undefined;
// Only add WebKit when a build is present (it is not installed in the cloud sandbox).
const hasWebkit = existsSync(browsersDir) && readdirSync(browsersDir).some((d) => d.startsWith("webkit"));

const common = { viewport: { width: 390, height: 844 }, locale: "he-IL", timezoneId: "Asia/Jerusalem" };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...common },
  webServer: {
    command: `bun run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...common,
        isMobile: false,
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
    ...(hasWebkit ? [{ name: "webkit", use: { ...devices["Desktop Safari"], ...common } }] : []),
  ],
});
