import { defineConfig } from "@playwright/test";

// PW_CHROMIUM_PATH lets a sandbox point at a pre-installed Chromium.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1, // the fake camera + software GL are CPU heavy
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    browserName: "chromium",
    viewport: { width: 1000, height: 800 },
    permissions: ["camera", "microphone"],
    launchOptions: {
      executablePath,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "node tests/serve.mjs",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
