import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  globalTeardown: "./scripts/stop-test-previews.mjs",
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    {
      name: "mobile-small",
      use: { ...devices["iPhone SE"], defaultBrowserType: "chromium" },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: [
    {
      command: "node node_modules/next/dist/bin/next dev -H 127.0.0.1",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: "node scripts/test-preview-server.mjs hosted",
      url: "http://localhost:3002",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "node scripts/test-preview-server.mjs local",
      url: "http://localhost:3003",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
