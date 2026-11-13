import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    // 電腦版是三欄版面，證據欄常駐右邊；兩種寬度都要能通關。
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  // CI 的 e2e 分片直接用 check 工作建好的 dist（PW_PREBUILT=1），不再各自重建。
  webServer: {
    command: process.env.PW_PREBUILT ? 'npm run preview' : 'npm run build && npm run preview',
    port: 4173, reuseExistingServer: true },
});
