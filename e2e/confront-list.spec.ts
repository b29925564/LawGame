/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 交互詰問「3 對質」清單（v97 第二道關卡第 6 點，設計師裁定 v97-blockers/designer-ruling.md）：
 * 桌機每列只寫名稱，清單自己捲、框高取到最後一張完整的列，外面的工作區不再捲；
 * 下面還有列時下緣有內陰影、捲過頂端上緣也有；Tab 到框外的列框自己捲到整列露出；
 * 洩漏的論點是名稱右側的狀態標籤「已洩漏・效果減半」，螢幕報讀當說明念。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: { cards: string[]; scene: number; scenes: Record<string, { exposed?: string[] }> } };

/** 手上論點最多的一局（蘇菲的庭五張可出示），談判時攤過論點 A、C。 */
function maxArgs(scene: number) {
  const p = structuredClone(save.ep1);
  p.scene = scene;
  for (const c of ['arg-h', 'arg-i']) if (!p.cards.includes(c)) p.cards.push(c);
  p.scenes['plea-morrow'].exposed = ['arg-a', 'arg-c'];
  return p;
}

async function toConfront(page: Page, scene: number) {
  await page.addInitScript(
    ([s]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('rd.dev.intro', '0');
      localStorage.setItem('lawgame-ep-auto', s);
    },
    [
      JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: maxArgs(scene) }),
    ] as const,
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^繼續（/ })
    .first()
    .click();
  await page.getByRole('button', { name: '開庭' }).click();
  const cross = page.getByRole('button', { name: '開始交互詰問' });
  for (let i = 0; i < 20 && !(await cross.isVisible()); i++) {
    await page.locator('button.primary.wide:not(.locked)').first().click();
    const pass = page.getByRole('button', { name: '不異議' });
    await pass.waitFor({ timeout: 3000 }).catch(() => {});
    if (await pass.isVisible()) await pass.click();
  }
  await cross.click();
  const open = page.locator('article.claim .steps > li:not(.done) button.wide');
  for (let i = 0; i < 4 && (await open.count()); i++) await open.first().click();
  await expect(page.locator('.confront-scroll .pick')).toHaveCount(5);
}

/** 框裡每一列不是整列在框內，就是整列在框外（框的焦點圈留白 4px 算框內）。 */
const cut = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('.confront-scroll')!.getBoundingClientRect();
    return [...document.querySelectorAll('.confront-scroll .pick')]
      .map((r) => r.getBoundingClientRect())
      .filter((r) => r.bottom > box.top && r.top < box.bottom)
      .filter((r) => r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5)
      .map(
        (r) =>
          `${Math.round(r.top)}–${Math.round(r.bottom)} / 框 ${Math.round(box.top)}–${Math.round(box.bottom)}`,
      );
  });

for (const [who, scene] of [
  ['柯瓦斯基', 17],
  ['蘇菲', 19],
] as const)
  test(`桌機 1440×900 ${who}：對質清單只寫名稱、自己捲、不切在列中間`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '手機照舊整頁捲（設計師裁定）');
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await toConfront(page, scene);
    const list = page.locator('.confront-list');
    const box = page.locator('.confront-scroll');
    // 只寫名稱，不印說明。
    await expect(box.locator('.pick-text')).toHaveCount(0);
    // 外面的工作區不用捲；清單自己捲。
    await expect
      .poll(() => page.locator('.shell-body').evaluate((b) => b.scrollHeight - b.clientHeight))
      .toBeLessThanOrEqual(1);
    await expect
      .poll(() => box.evaluate((b) => b.scrollHeight - b.clientHeight))
      .toBeGreaterThan(0);
    expect(await cut(page)).toEqual([]);
    // 下緣陰影：下面還有列；頂端沒捲過，上緣沒有。
    await expect(list).toHaveAttribute('data-down', 'true');
    await expect(list).not.toHaveAttribute('data-up');
    // 洩漏的論點：名稱同一行右側的狀態標籤，報讀時是這顆按鈕的說明。
    const a = box.getByRole('button', { name: /出示 論點 A/ });
    await expect(a.locator('.pick-status')).toHaveText('已洩漏・效果減半');
    await expect(a).toHaveAccessibleDescription('已洩漏・效果減半');
    const nameRow = await a.evaluate((b) => {
      const n = b.querySelector('.pick-name')!.getBoundingClientRect();
      const s = b.querySelector('.pick-status')!.getBoundingClientRect();
      return { sameLine: s.top < n.bottom && s.bottom > n.top, right: s.left >= n.right };
    });
    expect(nameRow).toEqual({ sameLine: true, right: true });
    await expect(
      box.getByRole('button', { name: /出示 論點 B/ }).locator('.pick-status'),
    ).toHaveCount(0);
    // Tab 一路到最後一列：框自己捲到那一列整列露出。
    await box.locator('.pick').first().focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    const last = box.locator('.pick').last();
    await expect(last).toBeFocused();
    await expect.poll(() => cut(page)).toEqual([]);
    const inBox = () =>
      page.evaluate(() => {
        const b = document.querySelector('.confront-scroll')!.getBoundingClientRect();
        const r = [...document.querySelectorAll('.confront-scroll .pick')]
          .at(-1)!
          .getBoundingClientRect();
        return r.top >= b.top && r.bottom <= b.bottom;
      });
    await expect.poll(inBox).toBe(true);
    // 捲到底：下緣陰影消失，上緣出現。
    await expect(list).not.toHaveAttribute('data-down');
    await expect(list).toHaveAttribute('data-up', 'true');
  });
