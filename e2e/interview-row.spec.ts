/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, episode: string, scene: number, lang: string, scale: number) {
  await page.goto('/');
  await page.evaluate(
    ([episode, scene, lang, scale]) => {
      localStorage.clear();
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
            episode,
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
    [episode, scene, lang, scale] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  await page
    .locator('.place-beat')
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/**
 * 會見底部的「提問｜施壓｜安撫（剩 2 次）」（設計師第二道關卡 72a9003 裁定 4：320 中文 150% 底部被切、「提⏎問」一字一行）。
 * 每顆按鈕的字一行、高 ≥44px，整列在選項區裡看得到，不切。
 */
for (const w of [320, 360, 412])
  for (const lang of ['zh', 'en'])
    test(`會見按鈕列：每顆一行、不切（${w}・${lang}）`, async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      await page.setViewportSize({ width: w, height: 760 });
      for (const ep of ['ep1', 'ep2'])
        for (const scale of [1, 1.25, 1.5]) {
          await open(page, ep, 4, lang, scale);
          const m = await page.locator('.actions > .row').evaluate((row) => {
            const panel = row.parentElement!.getBoundingClientRect();
            return [...row.querySelectorAll('button')].map((b) => {
              const r = document.createRange();
              r.selectNodeContents(b);
              const tops = new Set(
                [...r.getClientRects()].filter((x) => x.width > 0.5).map((x) => Math.round(x.top)),
              );
              const box = b.getBoundingClientRect();
              return {
                text: b.textContent,
                lines: tops.size,
                h: box.height,
                cut: box.bottom - panel.bottom,
              };
            });
          });
          for (const b of m) {
            const tag = `${ep} ${scale * 100}%「${b.text}」`;
            expect.soft(b.lines, `${tag} 排成幾行`).toBe(1);
            expect.soft(b.h, `${tag} 高`).toBeGreaterThanOrEqual(44);
            expect.soft(b.cut, `${tag} 超出選項區下緣`).toBeLessThanOrEqual(0.5);
          }
        }
    });

/**
 * 選項按鈕前面的「›」只是畫面上的記號，不進按鈕的無障礙名稱（設計師第二道關卡 72a9003 裁定 6：
 * 讀屏器唸成「› 我只是做我的工作。」）。用 Chrome 算出來的名稱（CDP 的無障礙樹）量。
 */
test('選項按鈕的無障礙名稱前面沒有「›」', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', '手機那一組跑就好');
  const cdp = await page.context().newCDPSession(page);
  let seen = 0;
  for (const [episode, step] of [
    ['ep1', 3],
    ['ep2', 4],
  ] as const) {
    await page.goto('/');
    await page.evaluate(
      ([episode, step]) => {
        localStorage.clear();
        localStorage.setItem('lawgame-lang', 'zh');
        localStorage.setItem(
          'lawgame-ep-auto',
          JSON.stringify({
            version: 5,
            savedAt: Date.now(),
            label: 'x',
            progress: {
              episode,
              scene: 0,
              step,
              choices: {},
              cards: [],
              flags: [],
              ethics: [],
              scenes: {},
            },
          }),
        );
      },
      [episode, step] as const,
    );
    await page.reload();
    await page.getByRole('button', { name: /^繼續/ }).first().click();
    await expect(page.locator('.replies button').first()).toBeVisible();
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: { role?: { value: string }; name?: { value: string } }[];
    };
    const names = nodes.filter((n) => n.role?.value === 'button').map((n) => n.name?.value ?? '');
    const chevron = names.filter((n) => n.trim().startsWith('›'));
    seen += names.length;
    expect(chevron, `${episode} 第 ${step} 步`).toEqual([]);
  }
  expect(seen).toBeGreaterThan(2);
});

/**
 * 會見的問題鈕（設計師 #329 @7fde9ba 第 1 項）：中文不在詞中間斷，行首不是「的了著過地得」，
 * 每一行至少 2 個字（不會「運作｜的？」一個字一行）。
 */
for (const w of [320, 360])
  test(`會見問題鈕：中文行首不是助詞、沒有一個字的行（${w}・zh・150%）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
    await page.setViewportSize({ width: w, height: 760 });
    for (const ep of ['ep1', 'ep2']) {
      await open(page, ep, 4, 'zh', 1.5);
      const rows = await page.locator('#iv-panel button').evaluateAll((els) =>
        els.map((el) => {
          const lines: string[] = [];
          let top = -1;
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const s = n.textContent ?? '';
            for (let i = 0; i < s.length; i++) {
              const r = document.createRange();
              r.setStart(n, i);
              r.setEnd(n, i + 1);
              const b = r.getBoundingClientRect();
              if (b.height < 0.5) continue;
              if (top < 0 || Math.abs(b.top - top) > 6) lines.push('');
              top = b.top;
              lines[lines.length - 1] += s[i];
            }
          }
          return lines;
        }),
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const lines of rows) {
        const all = lines.join('｜');
        for (const l of lines.slice(1))
          expect
            .soft(l.trim(), `${ep}「${all}」行首是助詞`)
            .not.toMatch(/^[的了著過地得][\p{P}]*$|^[的了著過][^\p{L}]/u);
        for (const l of lines)
          expect
            .soft(l.match(/[\p{L}\p{N}]/gu)?.length ?? 0, `${ep}「${all}」一個字一行`)
            .toBeGreaterThanOrEqual(2);
      }
    }
  });
