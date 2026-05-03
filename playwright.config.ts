import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4019',
    extraHTTPHeaders: {
      'x-cron-secret': process.env.NEURALIA_CRON_SECRET ?? 'neuralia_cron_x9Km2Pq7rT4wZ1vN',
    },
  },
})
