import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Some sandboxes (this repo's Claude Code environment among them) ship a Chromium build pinned
// to a specific Playwright revision at a fixed path, with browser auto-download disabled — reuse
// it when present instead of trying to download a possibly-mismatched revision. Real CI has no
// such path and instead runs `npx playwright install --with-deps chromium` (see
// .github/ci/test_wasm_worker.sh), so this simply falls through to Playwright's normal resolution
// there.
const PINNED_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = existsSync(PINNED_CHROMIUM) ? PINNED_CHROMIUM : undefined;

const CELLD_PORT = 19960;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "dot" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3210",
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev --port 3210",
    url: "http://localhost:3210",
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_LEDGER_API_BASE: `http://localhost:${CELLD_PORT}` },
    timeout: 60_000,
  },
});

export { CELLD_PORT };
