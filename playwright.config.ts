import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: "./tests/e2e", use: { baseURL: "http://localhost:3000", ...devices["Desktop Chrome"] }, webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true } });
