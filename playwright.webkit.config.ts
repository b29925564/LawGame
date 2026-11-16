import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// WebKit 冒煙：第一級支援（中文、100% 字級、桌機 1366–1920、手機 390–412）的核心流程。
// 不跑整套 e2e：第 1 集整集通關一條＋第 2 集每種場景各一次。
export default defineConfig({
  ...base,
  testIgnore: [],
  grepInvert: undefined,
  // 只在 CI 的 WebKit 才看得到的問題，留下截圖和軌跡（上傳成 artifact）。
  use: { ...base.use, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  testMatch: ['slice.spec.ts', 'webkit-smoke.spec.ts'],
  grep: [/第 1 集可以一路從冷開場玩到判決/, /在 WebKit 掛得起來/],
  projects: [
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 768 } },
    },
    { name: 'webkit-phone', use: { ...devices['iPhone 14'] } },
  ],
});
