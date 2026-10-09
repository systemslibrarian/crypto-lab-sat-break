import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  projects: [
    { name: 'claims', testMatch: /claims\.spec\.ts/ },
    { name: 'a11y', testMatch: /a11y\.spec\.ts/ },
  ],
  use: { baseURL: 'http://localhost:4216/crypto-lab-sat-break/', colorScheme: 'dark' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4216 --strictPort',
    url: 'http://localhost:4216/crypto-lab-sat-break/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
