/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

// 手機寬度的地點字卡：地點不在字中間省略（「Okafo…」），放不下時整段拿掉場所名，房間完整留著、不溢出。
for (const [ep, scene] of [
  ['ep2', 9],
  ['ep2', 30],
  ['ep1', 13],
] as const)
  for (const lang of ['zh-TW', 'en'])
    for (const w of [360, 390]) {
      test(`地點字卡不省略：${ep}-${scene} ${lang} ${w}px`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 800 });
        await page.goto('/');
        await page.evaluate(
          ([ep, scene, lang]) => {
            localStorage.setItem('lawgame-lang', lang as string);
            localStorage.setItem(
              'lawgame-ep-auto',
              JSON.stringify({
                version: 5,
                savedAt: Date.now(),
                label: 'x',
                progress: {
                  episode: ep,
                  scene,
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
          [ep, scene, lang] as const,
        );
        await page.reload();
        await page
          .getByRole('button', { name: /^(繼續|Continue)/ })
          .first()
          .click();
        const slate = page.locator('.place-slate');
        await expect(slate).toBeVisible();
        const m = await slate.evaluate((s) => {
          const r = (e: Element) => e.getBoundingClientRect();
          const where = s.querySelector('.ps-where')!;
          const room = s.querySelector('.ps-room')!;
          const inside = (e: Element) =>
            r(e).right <= r(where).right + 1 && r(e).bottom <= r(where).bottom + 1;
          return {
            roomIn: inside(room),
            ellipsis: [...s.querySelectorAll('*')].some(
              (e) => getComputedStyle(e).textOverflow === 'ellipsis',
            ),
            rightEdge: r(s).right,
            height: r(s).height,
          };
        });
        expect(m.ellipsis).toBe(false);
        expect(m.roomIn).toBe(true);
        expect(m.rightEdge).toBeLessThanOrEqual(w);
        // 放得下就一行；360 寬的英文放不下時，日子、時刻掉到下一行，房間還是完整的。
        expect(m.height).toBeLessThan(w >= 390 ? 40 : 70);
      });
    }
