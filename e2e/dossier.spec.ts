import { expect, test, type Page } from '@playwright/test';

// 卷宗元件（設定集第 9 章；設計師 P2-6）：案卷登錄表、證物袋、照片紀錄表、放大檢視。
const CARDS = ['watch-listed', 'heart-rate', 'chat-audit', 'watch-photo'];
async function restore(page: Page, slots: Record<string, [string, number]>) {
  await page.goto('/');
  await page.evaluate(
    ([slots, cards]) => {
      for (const [slot, [episode, scene]] of Object.entries(slots))
        localStorage.setItem(
          `lawgame-ep-${slot}`,
          JSON.stringify({
            version: 5,
            savedAt: Date.now(),
            label: 'x',
            progress: {
              episode,
              scene,
              step: 0,
              choices: {},
              cards,
              flags: [],
              ethics: [],
              scenes: {},
            },
          }),
        );
    },
    [slots, CARDS] as const,
  );
  await page.reload();
}

test('法院系統頂端的案卷登錄表：走過的行照實、目前那一行標出來、還沒發生的是黑條', async ({
  page,
}) => {
  await restore(page, { auto: ['ep1', 9] });
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page
    .getByRole('button', { name: /^法院系統/ })
    .first()
    .click();
  const docket = page.getByRole('region', { name: '案卷登錄表' });
  // 幕卡三行、拿到心率紀錄與稽核紀錄才有的法院事件兩行、檢視令一行；之後還沒發生的合成一條黑條（設計師 r2 第 6 條）。
  await expect(docket.locator('tbody tr')).toHaveCount(7);
  await expect(docket.locator('tr[aria-current="step"]')).toContainText('04/03/2026');
  await expect(docket.locator('tr[aria-current="step"]')).toContainText('預審');
  await expect(docket.getByText('尚未發生')).toHaveCount(1);
});

test('證物袋與照片紀錄表：證據欄展開看得到，放大檢視是完整版，Esc 關掉', async ({ page }) => {
  await restore(page, { auto: ['ep1', 9] });
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page
    .getByRole('button', { name: /^法院系統/ })
    .first()
    .click();
  await page.getByRole('region', { name: '案卷登錄表' }).waitFor();
  // 手機的證據欄在底部抽屜，按「證據」打開。
  const drawer = page.getByRole('button', { name: /^證據 \d/ });
  if (await drawer.isVisible()) await drawer.click();
  const bag = page.locator('.card.mini').filter({ hasText: '財物清單' }).first();
  await bag.locator('.mini-btn').click();
  await expect(bag.locator('.bag-chain li:not(.bag-chain-cols)')).toHaveCount(2);
  // 還沒做手錶鑑識（沒有 watch-notice）：入所扣押那一手之後都還沒發生，合成一條黑條，不洩漏還剩幾手。
  await expect(bag.locator('.bag-chain .bag-pending')).toHaveCount(1);
  await expect(bag.locator('.bag-head')).toContainText('CH-2026-1147');
  await bag.getByRole('button', { name: '放大', exact: true }).click();
  const zoom = page.getByRole('dialog', { name: /放大檢視/ });
  await expect(zoom).toBeVisible();
  await expect(zoom.locator('.bag-chain')).toContainText('R. Delgado');
  await page.keyboard.press('Escape');
  await expect(zoom).toBeHidden();

  const photo = page.locator('.card.mini').filter({ hasText: '驗屍照片' }).first();
  await photo.locator('.mini-btn').click();
  await expect(photo.locator('.photolog-strip')).toContainText('ME-26-0311');
  await expect(photo.locator('.photolog-strip')).toContainText('14/46');
});

test('存檔欄：縮小的登錄表加 Bates 區間', async ({ page }) => {
  await restore(page, { auto: ['ep1', 21], 1: ['ep1', 0] });
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page.getByRole('button', { name: '選單' }).click();
  await page.getByRole('tab', { name: '讀檔' }).click();
  const auto = page.locator('.slot').first();
  await expect(auto.locator('.dk-cur')).toContainText('04/08');
  // 從這一集的第一頁起，和幕卡同一套頁碼。
  await expect(auto.locator('.dk-bates')).toHaveText('WH-E01-000001–000266');
  // 冷開場還沒走到第一張登錄卡：沒有一行字，只有一條黑條。
  const cold = page.locator('.slot').nth(1);
  await expect(cold.locator('.dk-row:not(.dk-future)')).toHaveCount(0);
  await expect(cold.locator('.dk-bar')).toHaveCount(1);
  // 存檔畫面只准一道黃：滑鼠滑過不上螢光，鍵盤選中的那一欄才上。
  await auto.hover();
  await expect(page.locator('.slot.sel')).toHaveCount(0);
  await auto.focus();
  await expect(auto).toHaveClass(/\bsel\b/);
  await expect(page.locator('.slot.sel')).toHaveCount(1);
});
