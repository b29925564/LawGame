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
            // 日子、時刻、色溫換到第二行時，左緣要和地點文字左緣對齊（不從黃短槓底下開始）。
            wrapped: s.querySelector('.ps-when')
              ? r(s.querySelector('.ps-when')!).top > r(where).top + 4
              : false,
            whenLeft: s.querySelector('.ps-when') ? r(s.querySelector('.ps-when')!).left : 0,
            whereLeft: r(where).left,
            gap: s.querySelector('.ps-when')
              ? r(s.querySelector('.ps-when')!).left - r(where).right
              : 0,
          };
        });
        expect(m.ellipsis).toBe(false);
        expect(m.roomIn).toBe(true);
        expect(m.rightEdge).toBeLessThanOrEqual(w);
        // 放得下就一行；360 寬的英文放不下時，日子、時刻掉到下一行，房間還是完整的。
        expect(m.height).toBeLessThan(w >= 390 ? 40 : 70);
        if (m.wrapped) expect(Math.abs(m.whenLeft - m.whereLeft)).toBeLessThanOrEqual(1);
      });
    }

// 設計師 PR #309 複審 3：手機一行、拿掉場所名的時候，房間名到日子的距離就是設計的欄距（被拿掉的場所名不佔寬度）。
// 手機（≤640）的欄距和字距本來就比桌機小一點（8px＋0.02em，桌機 10px＋0.06em），所以和「這個寬度設計的欄距」比，
// 不直接和 1440 的數字比；1440 那張也照同一條量。
async function slateGap(
  page: import('@playwright/test').Page,
  ep: string,
  scene: number,
  w: number,
) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto('/');
  await page.evaluate(
    ([ep, scene]) => {
      localStorage.setItem('lawgame-lang', 'en');
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
    [ep, scene] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^Continue/ })
    .first()
    .click();
  const slate = page.locator('.place-slate');
  await expect(slate).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  return slate.evaluate((s) => {
    const r = (e: Element) => e.getBoundingClientRect();
    const room = r(s.querySelector('.ps-room')!);
    const when = r(s.querySelector('.ps-when')!);
    return {
      gap: when.left - room.right,
      want: parseFloat(getComputedStyle(s.querySelector('.ps-text')!).columnGap),
      oneLine: Math.abs(when.top - room.top) < 4,
    };
  });
}
for (const [ep, scene] of [
  ['ep2', 9],
  ['ep2', 30],
  ['ep1', 13],
] as const)
  test(`地點字卡（英文）拿掉場所名時，房間名到日子就是設計的欄距：${ep}-${scene}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '自己設視窗，只跑一次');
    let lines = 0;
    for (const w of [1440, 412, 390]) {
      const m = await slateGap(page, ep, scene, w);
      if (!m.oneLine) continue;
      lines++;
      expect(
        Math.abs(m.gap - m.want),
        `${w} 寬：房間名到日子 ${m.gap.toFixed(1)}px，設計的欄距 ${m.want.toFixed(1)}px`,
      ).toBeLessThanOrEqual(2);
    }
    expect(lines).toBeGreaterThanOrEqual(2);
  });

// 第二道關卡 72a9003 第 2 項：320 寬英文 125／150%，第 2 集第 22 場的房間 "hallway outside the mediation room" 只剩房間也放不下一行，
// 被裁成 "…mediation roo"。不出框第一：房間在詞界換行，每一行的字都在場記框裡。
for (const w of [320, 360])
  for (const lang of ['en', 'zh-TW'])
    for (const scale of [1.25, 1.5])
      test(`地點字卡：房間放不下一行時換行，不被裁掉（ep2-22・${w}・${lang}・${scale * 100}%）`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'chromium', '自己設視窗，手機那一組跑就好');
        await page.setViewportSize({ width: w, height: 640 });
        await page.goto('/');
        await page.evaluate(
          ([lang, scale]) => {
            localStorage.setItem('lawgame-lang', lang as string);
            localStorage.setItem(
              'lawgame-settings',
              JSON.stringify({ state: { textScale: scale }, version: 1 }),
            );
            localStorage.setItem(
              'lawgame-ep-auto',
              JSON.stringify({
                version: 5,
                savedAt: Date.now(),
                label: 'x',
                progress: {
                  episode: 'ep2',
                  scene: 22,
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
          [lang, scale] as const,
        );
        await page.reload();
        await page
          .getByRole('button', { name: /^(繼續|Continue)/ })
          .first()
          .click();
        const slate = page.locator('.place-slate');
        await expect(slate).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        const m = await slate.evaluate((s) => {
          const where = s.querySelector('.ps-where') as HTMLElement;
          const room = s.querySelector('.ps-room')!;
          const box = where.getBoundingClientRect();
          const out: string[] = [];
          const walk = document.createTreeWalker(room, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const r = document.createRange();
            r.selectNodeContents(n);
            for (const l of r.getClientRects())
              if (
                l.width &&
                (l.right > box.right + 0.5 ||
                  l.left < box.left - 0.5 ||
                  l.bottom > box.bottom + 0.5 ||
                  l.top < box.top - 0.5)
              )
                out.push(`${n.textContent}：${l.left.toFixed(1)}–${l.right.toFixed(1)}`);
          }
          return {
            text: room.textContent,
            out,
            box: `${box.left.toFixed(1)}–${box.right.toFixed(1)}`,
            slateRight: s.getBoundingClientRect().right,
          };
        });
        expect(m.out, `「${m.text}」超出場記框 ${m.box}`).toEqual([]);
        expect(m.slateRight).toBeLessThanOrEqual(w);
      });
