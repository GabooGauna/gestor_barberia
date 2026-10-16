import { defineConfig, devices } from "@playwright/test";

const appUrl = "http://127.0.0.1:4173";
const colorEnabledAppUrl = "http://127.0.0.1:4174";
const isolatedSupabaseUrl = "http://127.0.0.1:54321";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: appUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173",
      url: appUrl,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        VITE_SUPABASE_URL: isolatedSupabaseUrl,
        VITE_SUPABASE_ANON_KEY: "playwright-local-only",
        VITE_ENABLE_RUTINAS_COLOR: "false",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4174",
      url: colorEnabledAppUrl,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        VITE_SUPABASE_URL: isolatedSupabaseUrl,
        VITE_SUPABASE_ANON_KEY: "playwright-local-only",
        VITE_ENABLE_RUTINAS_COLOR: "true",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: /routine-colors-enabled\.spec\.js/,
      use: { ...devices["Desktop Chrome"], baseURL: appUrl },
    },
    {
      name: "chromium-routine-colors",
      testMatch: /routine-colors-enabled\.spec\.js/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: colorEnabledAppUrl,
      },
    },
  ],
});
