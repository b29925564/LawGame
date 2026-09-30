import { expect, test, type Page } from '@playwright/test';

async function chain(page: Page, question: string, cards: string[], relation: string) {
  const panel = page.locator('section.chain').filter({ hasText: question });
  await panel.getByRole('button', { name: '＋ 放卡片' }).first().click();
  for (const c of cards) await panel.getByRole('button', { name: c, exact: true }).click();
  await panel.getByRole('radio', { name: new RegExp(relation) }).click();
  await panel.getByRole('button', { name: /提交到案情會議/ }).click();
  await expect(panel.getByText('案情會議通過')).toBeVisible();
}

async function impeach(page: Page, claim: string, lockQ: string, setupQ: string, arg: string) {
  const panel = page.locator('article.claim').filter({ hasText: claim });
  await panel.getByRole('button', { name: lockQ }).click();
  await panel.getByRole('button', { name: setupQ }).click();
  await panel.getByRole('button', { name: '出示論點' }).click();
  await panel.getByRole('button', { name: arg }).click();
}

test('自動通關：三次彈劾成功，判決無罪', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /系統原型/ }).click();
  await page.getByRole('button', { name: '打開證據板' }).click();

  await chain(page, '伊森為什麼', ['伊森手錶的通知', '叫車收據'], '支持');
  await chain(page, '沃斯什麼時候死的', ['法醫報告', '沃斯手錶心率紀錄'], '支持');
  await chain(page, '誰收回了', ['聊天系統稽核紀錄', '完整門禁紀錄'], '說明機會');
  await chain(page, '不在場說法', ['瑞秋的警詢筆錄', '新加坡會議紀錄'], '矛盾');
  await page.getByRole('button', { name: '開庭' }).click();

  await page.getByRole('button', { name: /心率/ }).click();
  await page.getByRole('button', { name: '結束詰問' }).click();

  await impeach(
    page,
    '22:50 左右',
    '妳確定是十點五十分，不是更早？',
    '沃斯先生每天都會看手錶',
    '論點 B',
  );
  await impeach(page, '新加坡開視訊會議', '中間妳沒有離開過？', '會議系統會自動記錄', '論點 E');
  await impeach(page, '十點四十分就離開', '一次都沒有回到 31 樓？', '稽核紀錄', '論點 D');
  await expect(page.getByText('自證己罪')).toBeVisible();

  for (const a of ['論點 A', '論點 B', '論點 D'])
    await page.getByRole('button', { name: a }).click();
  await page.getByRole('button', { name: '結辯，交給陪審團' }).click();
  await expect(page.getByRole('heading', { name: '無罪' })).toBeVisible();
});
