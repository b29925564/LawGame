/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * #442：教學全在第 1 集，第一次玩的人不能從新遊戲直接開第 2 集。
 * 第 1 集走到集尾卡後，回標題就看得到第 2 集。
 */
async function title(page: Page, seed: (() => void) | null, pick = true) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lawgame-lang', 'zh');
  });
  if (seed) await page.evaluate(seed);
  await page.reload();
  if (pick) await page.getByRole('button', { name: '新遊戲' }).click();
}

const ep2 = (page: Page) => page.getByRole('button', { name: /^第 2 集/ });

test('第一次玩：按新遊戲直接開始第 1 集，看不到第 2 集', async ({ page }) => {
  await title(page, null);
  await expect(page.locator('.title-screen')).toHaveCount(0);
  await expect(ep2(page)).toHaveCount(0);
});

test('第 1 集走到集尾卡，回標題後第 2 集出現', async ({ page }) => {
  await title(
    page,
    () => {
      // 停在第 1 集最後一場（集尾卡）的自動存檔。場景序在頁面裡查不到，給一個超過範圍的值：走過最後一場也算集尾。
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep1',
            scene: 9999,
            step: 0,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    false,
  );
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page.getByRole('button', { name: '回標題' }).click();
  await page.getByRole('button', { name: '新遊戲' }).click();
  await expect(ep2(page)).toBeVisible();
});
