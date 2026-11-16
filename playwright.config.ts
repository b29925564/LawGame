import { defineConfig, devices } from '@playwright/test';

/**
 * e2e 分兩層（pipeline/process-v2.md 第 5 節）：
 * - PR 快速層（E2E_TIER=fast）：只跑第一級支援組合（中文、100% 字級、桌機、390／412 手機）。
 * - 合併後全站掃描（push main，不設 E2E_TIER）：全部，包括第二、三級組合和斷行掃描。
 * 檢查只分層、不刪：快速層略過的，合併後一定會跑。
 */
const FAST = process.env.E2E_TIER === 'fast';
/** 整支只在全站掃描跑：身分列、短標籤斷行掃描，和只量 320／360 的窄螢幕掃描。 */
const FULL_ONLY = [
  'short-labels.spec.ts',
  'gate2-464a280.spec.ts',
  'gate2-dd50064.spec.ts',
  'narrow-sweep.spec.ts',
];
/** 標題寫著第二、三級組合（英文、125／150%、320、360、1920）的測試，只在全站掃描跑。 */
const TIER23 = /(?<!\d)(320|360|1920)(?!\d)|\ben\b|English|英文|125|150/;

export default defineConfig({
  testDir: 'e2e',
  // WebKit 冒煙只由 playwright.webkit.config.ts 跑。
  // 全路線通關（e2e/sweep）只由 playwright.sweep.config.ts 跑。
  testIgnore: ['webkit-smoke.spec.ts', 'sweep/**', ...(FAST ? FULL_ONLY : [])],
  grepInvert: FAST ? TIER23 : undefined,
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    // 電腦版是三欄版面，證據欄常駐右邊；兩種寬度都要能通關。
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  // CI 的 e2e 分片直接用 static 工作建好的 dist（PW_PREBUILT=1），不再各自重建。
  webServer: {
    command: process.env.PW_PREBUILT ? 'npm run preview' : 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: true,
  },
});
