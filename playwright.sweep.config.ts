import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// 全路線通關（process-v2 第 5 節第 15 項）：第 1 集 R1–R7、第 2 集 E1–E11，每條都檢查台詞有沒有漏。
// 只在合併後的全站掃描跑（ci.yml 的 routes 工作），不擋 PR。原本是測試員的 qa/tests 腳本。
export default defineConfig({
  ...base,
  testDir: 'e2e/sweep',
  testIgnore: [],
  grepInvert: undefined,
  timeout: 300_000,
  use: { ...base.use, actionTimeout: 15_000 },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1530, height: 860 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
