import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.artifacts/playwright/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:mock -- --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'phone', use: { viewport: { width: 360, height: 800 } } },
  ],
})
