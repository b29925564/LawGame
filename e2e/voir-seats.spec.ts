import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * 遴選陪審席的兩排錯位（Issue #434）：前後排各錯半格、左右對稱，每一席離木框內緣都留得出空，
 * 不再只有後排往右推、席 12 貼著木框右緣（1440 只剩 9 px）。
 */
const seeds = JSON.parse(
  readFileSync(new URL('./fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as Record<'ep1', { scene: number; step: number; scenes: Record<string, unknown> }>;

for (const w of [1280, 1366, 1440, 1920])
  test(`桌機 ${w}：陪審席兩排錯位左右對稱，每席離木框至少 16 px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '手機是一排的小席位');
    await page.setViewportSize({ width: w, height: 900 });
    const p = structuredClone(seeds.ep1);
    p.scene = 15;
    p.step = 0;
    delete p.scenes['voir-dire'];
    await page.addInitScript(
      (save) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('lawgame-ep-auto', save);
      },
      JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: p }),
    );
    await page.goto('/');
    await page
      .getByRole('button', { name: /^繼續（/ })
      .first()
      .click();
    await page.getByRole('button', { name: '開始遴選' }).click();
    const rows = page.locator('.box .seat-rows');
    await expect(rows).toBeVisible();
    const m = await rows.evaluate((el) => {
      const box = el.closest('.box')!.getBoundingClientRect();
      const row = (sel: string) =>
        [...el.querySelectorAll(`${sel} > .seatc`)].map((c) => {
          const r = (c.firstElementChild ?? c).getBoundingClientRect();
          return { l: r.left - box.left, r: box.right - r.right };
        });
      return { back: row('.seats.back'), front: row('.seats:not(.back)') };
    });
    const all = [...m.back, ...m.front];
    expect(Math.min(...all.map((c) => Math.min(c.l, c.r)))).toBeGreaterThanOrEqual(16);
    // 後排的右緣空間等於前排的左緣空間（對稱），而且真的有錯開。
    expect(Math.abs(m.back.at(-1)!.r - m.front[0].l)).toBeLessThanOrEqual(2);
    expect(Math.abs(m.back[0].l - m.front.at(-1)!.r)).toBeLessThanOrEqual(2);
    expect(m.back[0].l - m.front[0].l).toBeGreaterThanOrEqual(17);
  });
