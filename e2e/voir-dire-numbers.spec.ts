/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

/**
 * 第二道關卡 72a9003 第 3 項：第 2 集第 15 場陪審團遴選，320／360 寬中文 150%，候選人號碼「10」「11」「12」超出號碼欄 3.6px。
 * 號碼欄跟著兩位數的寬度長；每一列的號碼欄一樣寬，頭像還是對齊在同一條線上。
 */
for (const w of [320, 360])
  for (const lang of ['zh', 'en'])
    for (const scale of [1, 1.5])
      test(`遴選候選人號碼不出框，頭像對齊（${w}・${lang}・${scale * 100}%）`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'chromium', '自己設視窗，手機那一組跑就好');
        await page.setViewportSize({ width: w, height: 640 });
        await page.goto('/');
        await page.evaluate(
          ([lang, scale]) => {
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
                  episode: 'ep2',
                  scene: 15,
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
        const beat = page.locator('.place-beat');
        await beat.click({ timeout: 3000 }).catch(() => {});
        await page.getByRole('button', { name: /^(開始遴選|Begin jury selection)/ }).click();
        await expect(page.locator('button.cand').nth(11)).toBeAttached();
        await page.evaluate(() => document.fonts.ready);
        const m = await page.evaluate(() =>
          [...document.querySelectorAll('button.cand')].map((c) => {
            const no = c.querySelector('.no')!;
            const box = no.getBoundingClientRect();
            const r = document.createRange();
            r.selectNodeContents(no);
            const t = r.getBoundingClientRect();
            const pic = c.querySelector('.no + *')!.getBoundingClientRect();
            return {
              no: no.textContent,
              over: Math.max(t.right - box.right, box.left - t.left),
              pic: pic.left,
            };
          }),
        );
        expect(m.length).toBe(12);
        for (const x of m)
          expect(x.over, `${x.no} 號超出號碼欄 ${x.over.toFixed(1)}px`).toBeLessThanOrEqual(0.5);
        const lefts = m.map((x) => x.pic);
        expect(
          Math.max(...lefts) - Math.min(...lefts),
          `頭像左緣 ${lefts.join(', ')}`,
        ).toBeLessThanOrEqual(0.5);
      });
