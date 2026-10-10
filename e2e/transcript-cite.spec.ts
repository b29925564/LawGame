import { expect, test } from '@playwright/test';

// 第二道關卡第 12 條（v91 A）：卷宗裡崔佛的錄取逐字稿和證人準備的影本同一套排版，頁行對得上證據卡引的 42:7。
for (const lang of ['zh', 'en'])
  test(`卷宗逐字稿：25 行一頁、頁首與 Bates，答句在第 7 行（${lang}）`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((lang) => {
      localStorage.setItem('lawgame-lang', lang);
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep2',
            scene: 10,
            step: 0,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    }, lang);
    await page.reload();
    await page
      .getByRole('button', { name: /^(繼續|Continue)/ })
      .first()
      .click();
    const beat = page.locator('.place-beat');
    await page.waitForTimeout(300);
    if (await beat.count()) await beat.click();
    await page
      .getByRole('button', { name: /^(卷宗|Case file)/ })
      .first()
      .click();
    await page
      .locator('button')
      .filter({ hasText: /崔佛・米爾斯|Trevor Mills/ })
      .first()
      .click();
    // 和證人準備的影本同一套排版：問占 5–6、答從第 7 行起（證據卡引的 42:7）。
    const rec = page.locator('.doc-record');
    await expect(rec.locator('.rec-head').first()).toHaveAttribute('data-r', /42|頁|Page/);
    await expect(rec.locator('.rec-foot').first()).toHaveAttribute('data-b', /^WH-E02-\d{6}$/);
    // 一整頁 25 行，行號都印著。
    await expect(rec.locator('.rec-row')).toHaveCount(25);
    const nos = await rec
      .locator('.rec-row')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-no')));
    expect(nos).toEqual(Array.from({ length: 25 }, (_, i) => String(i + 1)));
    // 行號是紙上印的字：Courier Prime。
    const numFont = await rec
      .locator('.rec-row')
      .first()
      .evaluate((el) => getComputedStyle(el, '::before').fontFamily);
    expect(numFont).toMatch(/^"?Courier Prime/);
    // 問的第一行是 5，答的第一行是 7。
    const q = rec.locator('.rec-entry.q .rec-row').first();
    const a = rec.locator('.rec-entry.a .rec-row').first();
    await expect(q).toHaveAttribute('data-no', '5');
    await expect(a).toHaveAttribute('data-no', '7');
    await expect(a).toContainText(/從系統上線就是提醒|reminder/);
    // 每一句仍是按鈕：點答句標記成卡（螢光筆畫在字上，不畫在整行）。
    const sentence = rec.locator('.rec-entry.a .sentence');
    await sentence.click();
    await expect(sentence).toHaveAttribute('aria-pressed', 'true');
  });
