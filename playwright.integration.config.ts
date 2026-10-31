import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration",
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3001",
    viewport: { width: 390, height: 844 },
  },
});
