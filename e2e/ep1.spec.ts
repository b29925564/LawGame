import { expect, test, type Page } from '@playwright/test';

async function collect(page: Page, app: string, doc: string, evidence: string) {
  await page.getByRole('button', { name: app }).click();
  await page.getByRole('button', { name: doc }).click();
  await page.getByRole('button', { name: `列為證據：${evidence}` }).click();
  await page.getByRole('button', { name: '返回列表' }).click();
}

async function present(page: Page, statement: number, evidence: string) {
  while (!(await page.getByText(`證詞 ${statement}/`).isVisible())) {
    await page.getByRole('button', { name: '下一句' }).click();
  }
  await page.getByRole('button', { name: '出示證據' }).click();
  await page.getByRole('listitem').filter({ hasText: evidence }).getByRole('button').click();
}

test('自動通關：照標準解法打完第 1 集', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  while (await page.getByRole('button', { name: '繼續' }).isVisible()) {
    await page.getByRole('button', { name: '繼續' }).click();
  }

  await collect(page, '郵件', '轉寄：門禁卡不見了', '門禁卡掛失信');
  await collect(page, '監視器', '街角超商', '超商監視器畫面');
  await collect(page, '通聯紀錄', '林國華通聯紀錄', '林國華通聯紀錄');
  await page.getByRole('button', { name: '前往法庭' }).click();

  await present(page, 2, '超商監視器畫面');
  await present(page, 3, '門禁卡掛失信');
  await present(page, 4, '林國華通聯紀錄');

  await expect(page.getByRole('heading', { name: '勝訴' })).toBeVisible();
});
