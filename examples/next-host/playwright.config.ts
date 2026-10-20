import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", timeout: 30000, use: { baseURL: "http://127.0.0.1:3300" },
  webServer: [
    { command: "pnpm dev", port: 3300, reuseExistingServer: !process.env.CI, timeout: 90000 },
    { command: "node scripts/range-server.mjs", port: 3400,
      reuseExistingServer: !process.env.CI, timeout: 10000 },
  ],
});
