import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'] } }],
  webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true },
});
