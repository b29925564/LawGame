/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 出示成立的那一拍（Issue #354，設計師裁定 i354-scene-looks/designer-rulings.md）：
 * 證人席從鋪陳走到對質，停到證人的話出完再停一拍，這段時間輸入鎖住；手機打開插入鏡頭。
 * 出示不成立（鎖定只拿到弱的說法）時鏡頭不演對質。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

/** 讀檔進柯瓦斯基的庭、聽完主詰問、開始交互詰問。 */
async function toCross(page: Page) {
  await page.addInitScript(
    ([s]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('rd.dev.intro', '0');
      localStorage.setItem('lawgame-ep-auto', s);
    },
    [JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 })] as const,
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^繼續（/ })
    .first()
    .click();
  await page.getByRole('button', { name: '開庭' }).click();
  const cross = page.getByRole('button', { name: '開始交互詰問' });
  for (let i = 0; i < 12 && !(await cross.isVisible()); i++) {
    await page.locator('button.primary.wide:not(.locked)').first().click();
    const pass = page.getByRole('button', { name: '不異議' });
    await pass.waitFor({ timeout: 3000 }).catch(() => {});
    if (await pass.isVisible()) await pass.click();
  }
  await cross.click();
}

const witnessPlate = (page: Page, state: string) =>
  page.locator(`.cam-stage[data-cam="witness"] .cam-plate img[src*="witness-${state}"]`);

for (const strong of [true, false])
  test(`出示${strong ? '成立：鏡頭演對質、輸入鎖住、演完換下一項' : '不成立：鏡頭不演對質'}`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const phone = info.project.name !== 'desktop';
    await toCross(page);
    const claim = page.locator('article.claim');
    await claim
      .getByRole('button', { name: strong ? /「所有」是指所有/ : /你們大概都查過了吧/ })
      .click();
    await claim.getByRole('button', { name: /智慧手錶會同步手機的通知/ }).click();
    if (!phone) await expect(witnessPlate(page, 'build').first()).toBeAttached();
    await claim.getByRole('button', { name: /出示 論點 A/ }).click();
    const panel = page.locator('section.panel:has(article.claim)');
    if (!strong) {
      // 不成立：照舊用筆錄的回饋，鏡頭不換到對質、輸入不鎖。
      await expect(page.locator('.record').getByText('手錶那種東西')).toBeVisible();
      await page.waitForTimeout(1500);
      await expect(witnessPlate(page, 'confront')).toHaveCount(0);
      await expect(panel).not.toHaveAttribute('inert', '');
      return;
    }
    // 對質那一拍：證人席是對質的底圖，交互詰問那一欄鎖住；手機打開插入鏡頭。
    await expect(panel).toHaveAttribute('inert', '');
    if (phone) await expect(page.locator('.court-cam.insert')).toHaveAttribute('data-open');
    await expect(witnessPlate(page, 'confront').first()).toBeAttached();
    await expect(page.locator('.record').getByText('那則通知……我沒有看過')).toBeVisible();
    // 演完：鬆開輸入，換回下一項證詞的狀態（這一場只有一項證詞，留在原處），手機收起插入鏡頭。
    await expect(panel).not.toHaveAttribute('inert', '', { timeout: 8000 });
    await expect(witnessPlate(page, 'confront')).toHaveCount(0, { timeout: 3000 });
    if (phone) await expect(page.locator('.court-cam.insert')).not.toHaveAttribute('data-open');
  });

// 對質停格時往左看筆錄：這一批跨到新的一頁時，新頁要等第一行字印出來才翻，
// 在那之前停在上一頁（證人那句在第 2 頁底），框裡任何時候都至少有一行字（設計師 i354-confront ②）。
test('出示成立：筆錄不翻到還沒有字的空白頁', async ({ page }) => {
  test.setTimeout(90_000);
  await toCross(page);
  const claim = page.locator('article.claim');
  await claim.getByRole('button', { name: /「所有」是指所有/ }).click();
  await claim.getByRole('button', { name: /智慧手錶會同步手機的通知/ }).click();
  await page.waitForTimeout(1500);
  await claim.getByRole('button', { name: /出示 論點 A/ }).click();
  const empty: number[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    const printed = await page.evaluate(() => {
      const box = document.querySelector('.record .rec-scroll');
      if (!box) return -1;
      const r = box.getBoundingClientRect();
      const ins = document.querySelector('.court-cam.insert[data-open]');
      const bottom = Math.min(r.bottom, ins ? ins.getBoundingClientRect().top : Infinity);
      return [...box.querySelectorAll('.rec-row .rec-tx')].filter((e) => {
        const b = e.getBoundingClientRect();
        return (
          (e.textContent ?? '').trim() &&
          b.bottom > r.top + 2 &&
          b.top < bottom - 2 &&
          Number(getComputedStyle(e).opacity) > 0.05
        );
      }).length;
    });
    if (printed === 0) empty.push(Date.now() - t0);
    await page.waitForTimeout(40);
  }
  expect(empty, '筆錄框裡沒有任何印出來的字（毫秒）').toEqual([]);
});
