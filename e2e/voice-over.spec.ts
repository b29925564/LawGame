/// <reference lib="dom" />
// 這個測試要在瀏覽器裡量 React 提交次數與進度線寬度，需要 DOM 型別。
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parse } from 'yaml';

/** 認罪協商的尾聲最後一句是畫外字幕：直接讀存檔跳到那一句。 */
async function openVoiceOver(page: Page) {
  const ep1 = parse(readFileSync('src/content/ep1.yaml', 'utf8')) as {
    scenes: { id: string; steps?: { voice?: string }[] }[];
  };
  const scene = ep1.scenes.findIndex((s) => s.id === 'epilogue-deal');
  const step = ep1.scenes[scene].steps!.findIndex((s) => s.voice === 'off');
  // 數 React 的提交次數：production 版也會通知開發者工具的掛鉤。
  await page.addInitScript(() => {
    const w = window as unknown as { __commits: number; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown };
    w.__commits = 0;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onCommitFiberRoot: () => w.__commits++,
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    };
  });
  await page.goto('/');
  const progress = { episode: 'ep1', scene, step, choices: {}, cards: [], flags: [], ethics: [] };
  await page.evaluate(
    (p) =>
      localStorage.setItem(
        'lawgame-ep-1',
        JSON.stringify({ version: 5, savedAt: 0, label: '', progress: { ...p, scenes: {} } }),
      ),
    progress,
  );
  await page.reload();
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取存檔 1' }).click();
  await expect(page.locator('.vo-cue.on')).toBeVisible();
}

test('畫外字幕停留時，進度線自己走，不必每一幀重繪；時間到自動前進', async ({ page }) => {
  await openVoiceOver(page);
  const r = await page.evaluate(async () => {
    const w = window as unknown as { __commits: number };
    const bar = () => getComputedStyle(document.querySelector('.vo-progress')!, '::after').width;
    const ch = document.querySelector('.vo .ch') as HTMLElement & { __probe?: number };
    ch.__probe = 1;
    const c0 = w.__commits;
    const w0 = parseFloat(bar());
    await new Promise((r) => setTimeout(r, 1000));
    const same = document.querySelector('.vo .ch') as HTMLElement & { __probe?: number };
    return { commits: w.__commits - c0, grew: parseFloat(bar()) - w0, probe: same.__probe };
  });
  expect(r.probe).toBe(1);
  expect(r.grew).toBeGreaterThan(10);
  // 以前每一幀提交一次（一秒約 60 次）。
  expect(r.commits).toBeLessThan(5);
  // 停留最長 7 秒，再等 400ms 自動前進。
  await expect(page.locator('.vo')).toHaveCount(0, { timeout: 9000 });
});

test('畫外字幕：出完字後按 Enter 就前進', async ({ page }) => {
  await openVoiceOver(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.vo')).toHaveCount(0);
});
