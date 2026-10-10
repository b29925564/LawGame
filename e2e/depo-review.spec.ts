import { expect, test } from '@playwright/test';

// 第二道關卡第 11 條：取證回顧的標籤要和摘要對得上。對沒有毛病的問題提異議，摘要算一筆站不住的異議，
// 這題就不能標成「照答」。
test('取證回顧：每一筆站不住的異議都有自己的標籤，沒有被標成「照答」', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: 'x',
        progress: {
          episode: 'ep2',
          scene: 9,
          step: 0,
          choices: {},
          cards: [],
          flags: [],
          ethics: [],
          scenes: {},
        },
      }),
    );
  });
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  const beat = page.locator('.place-beat');
  await page.waitForTimeout(300);
  if (await beat.count()) await beat.click();
  await page.getByRole('button', { name: '開始錄取' }).click();
  // 五題都提異議：e-feel 提對的「推測」（擋住了），其餘四題提「無關」：
  // e-role、e-after、e-could 沒有毛病（不用擋），e-ticket 有毛病但理由不對（擋錯了）。
  const sequence = ['無關', '無關', '推測', '無關', '無關'];
  for (const o of sequence) await page.getByRole('button', { name: o, exact: true }).click();
  const review = page.locator('.depo-review');
  await expect(review).toBeVisible();
  const n = Number(await page.locator('dt:has-text("站不住的異議") + dd').innerText());
  expect(n).toBe(4);
  await expect(review.locator('.depo-tag.baseless')).toHaveCount(3);
  await expect(review.locator('.depo-tag.wrong')).toHaveCount(1);
  await expect(review.locator('.depo-tag.blocked')).toHaveCount(1);
  await expect(review.locator('.depo-tag.plain')).toHaveCount(0);
  // 紅綠只給成立和有罪傾向：回顧頁上的標籤沒有 --good／--bad 的顏色，答錯的是鉛筆便條。
  const colors = await page.evaluate(() => {
    const probe = (v: string) => {
      const i = document.createElement('i');
      i.style.color = `var(${v})`;
      document.body.append(i);
      const c = getComputedStyle(i).color;
      i.remove();
      return c;
    };
    const [good, bad, pencil] = [probe('--good'), probe('--bad'), probe('--pencil')];
    const tags = [...document.querySelectorAll('.depo-tag')].map((e) => {
      const c = getComputedStyle(e);
      return { cls: e.className, color: c.color, border: c.borderTopColor, bg: c.backgroundColor };
    });
    return { good, bad, pencil, tags };
  });
  for (const t of colors.tags) {
    expect([colors.good, colors.bad]).not.toContain(t.color);
    expect([colors.good, colors.bad]).not.toContain(t.border);
    if (/wrong|baseless|waived/.test(t.cls)) expect(t.color).toBe(colors.pencil);
  }
});
