import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 3100;
export const E2E_DATA = path.resolve(__dirname, ".data/e2e");

export default defineConfig({
  testDir: "tests/e2e",
  globalTeardown: "./tests/e2e/teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Fresh local database + file outbox for every run.
    // Server output goes to a file so teardown can check it for PII.
    command: `rm -rf "${E2E_DATA}" && mkdir -p "${E2E_DATA}" && npx next build && npx next start -p ${PORT} > "${E2E_DATA}/server.log" 2>&1`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATA_BACKEND: "local",
      LOCAL_DB_DIR: path.join(E2E_DATA, "pglite"),
      EMAIL_PROVIDER: "file",
      OUTBOX_DIR: path.join(E2E_DATA, "outbox"),
      APP_URL: `http://localhost:${PORT}`,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "",
      GEOCODER: "fake",
      ROUTING_PROVIDER: "fake",
      SOLVER_URL: "",
      CRON_SECRET: "e2e-cron-secret-0123456789",
      DRIVER_INVITE_CODE: "e2e-invite-0123",
      CONTACT_EMAIL: "team@stemcycle.example",
      // Automatic routing: tick every 2 s and treat 2 quiet seconds as "settled".
      LOCAL_ROUTING_TICK_SECONDS: "2",
      ROUTING_QUIET_SECONDS: "2",
    },
  },
});
