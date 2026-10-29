import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/pwa',
  outputDir: '.artifacts/playwright/pwa',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5175',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  },
  webServer: {
    command: 'npm run preview -- --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
  },
  timeout: 45000,
})
