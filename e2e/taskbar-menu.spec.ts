/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { endsBanned } from '../src/ui/plateBreaks';

/**
 * 桌面頂列（第二道關卡 7075839 舊問題 10；設計師 v93 裁定 一之 6）：英文 150%、寬 ≤412 時「Trial in three days」伸進「選單」鈕。
 * 期限字和選單鈕之間至少 8px；放不下就換到下一行，不用省略號、不切字。
 * 存檔：第一集 scene 9（審前桌面）。
 */
for (const [w, h] of [
  [320, 640],
  [360, 740],
  [412, 839],
] as const)
  for (const [lang, scale] of [
    ['en', 1.5],
    ['en', 1.25],
    ['en', 1],
    ['zh', 1.5],
  ] as const)
    test(`桌面頂列：期限字和選單鈕至少隔 8px，不用省略號（${w}・${lang}・${scale * 100}%）`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
      await page.setViewportSize({ width: w, height: h });
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
                episode: 'ep1',
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
        },
        [lang, scale] as const,
      );
      await page.reload();
      await page
        .getByRole('button', { name: /^(繼續|Continue)/ })
        .first()
        .click();
      const beat = page.locator('.place-beat');
      await page.waitForTimeout(300);
      if (await beat.count()) await beat.click();
      const due = page.locator('.taskbar > .muted');
      await expect(due).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const m = await due.evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const ink = r.getBoundingClientRect();
        const menu = document.querySelector('.menu-toggle')!.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          text: el.textContent,
          right: Math.max(ink.right, el.getBoundingClientRect().right),
          top: ink.top,
          bottom: ink.bottom,
          menu: { l: menu.left, t: menu.top, b: menu.bottom },
          // scrollWidth／scrollHeight 是整數，行高有小數時會多 1。
          clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
          ellipsis: cs.textOverflow === 'ellipsis',
          // 每一行的字（一個字一個字量位置）。
          rows: (() => {
            const out: string[] = [];
            const rg = document.createRange();
            let cur = '';
            let top: number | null = null;
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              const s = n.textContent!;
              for (let i = 0; i < s.length; i++) {
                rg.setStart(n, i);
                rg.setEnd(n, i + 1);
                const q = rg.getClientRects()[0];
                if (q && top !== null && q.top > top + 4) {
                  out.push(cur);
                  cur = '';
                }
                if (q) top = q.top;
                cur += s[i];
              }
            }
            out.push(cur);
            return out.map((x) => x.trim()).filter(Boolean);
          })(),
        };
      });
      // 中文只在詞與詞之間換行：「開庭｜三天後」，不出現「開庭三天｜後」（第二道關卡 e771fcf 第 5 項，360 中文 150%）。
      if (lang === 'zh')
        expect([['開庭　三天後'], ['開庭', '三天後']], m.rows.join('｜')).toContainEqual(m.rows);
      expect(m.text?.replace(/\u00a0/g, ' ')).toBe(
        lang === 'en' ? 'Trial in three days' : '開庭　三天後',
      );
      expect(
        m.menu.l - m.right,
        `期限字右緣 ${m.right}，選單鈕左緣 ${m.menu.l}`,
      ).toBeGreaterThanOrEqual(8);
      expect(m.clipped, '期限字被切').toBe(false);
      expect(m.ellipsis, '不用省略號').toBe(false);
    });

/**
 * 英文頂列期限：數字和單位不拆、最後一行不只一個字、不折成四行（設計師裁定 25376da：
 * 320 寬 125% 折成「Pretrial｜hearing in｜three｜weeks」，36 次換行有 19 次末行只剩 days／week／weeks）。
 */
for (const [ep, scene] of [
  ['ep1', 7],
  ['ep1', 9],
  ['ep2', 6],
  ['ep2', 10],
] as const)
  test(`英文頂列期限：末行至少兩個字、數字和單位同一行（${ep} 第 ${scene} 場，320／360／390／412，字級 100／125／150%）`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '自己設視窗大小，桌機那一組跑就好');
    for (const w of [320, 360, 390, 412])
      for (const scale of [1, 1.25, 1.5]) {
        await page.setViewportSize({ width: w, height: 740 });
        await page.goto('/');
        await page.evaluate(
          ([ep, scene, scale]) => {
            localStorage.clear();
            localStorage.setItem('lawgame-lang', 'en');
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
          [ep, scene, scale] as const,
        );
        await page.reload();
        await page
          .getByRole('button', { name: /^Continue/ })
          .first()
          .click();
        const beat = page.locator('.place-beat');
        await page.waitForTimeout(300);
        if (await beat.count()) await beat.click({ timeout: 3000 }).catch(() => {});
        const due = page.locator('.taskbar > .muted');
        await expect(due).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const clipped = await due.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        const rows = await due.evaluate((el) => {
          const out: string[] = [];
          const rg = document.createRange();
          let cur = '';
          let top: number | null = null;
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const s = n.textContent!;
            for (let i = 0; i < s.length; i++) {
              rg.setStart(n, i);
              rg.setEnd(n, i + 1);
              const q = rg.getClientRects()[0];
              if (q && top !== null && q.top > top + 4) {
                out.push(cur);
                cur = '';
              }
              if (q) top = q.top;
              cur += s[i];
            }
          }
          out.push(cur);
          return out.map((x) => x.replace(/\u00a0/g, ' ').trim()).filter(Boolean);
        });
        const at = `${w}・${scale * 100}%：${rows.join('｜')}`;
        expect(clipped, `${at} 期限字凸出欄外`).toBe(false);
        expect(rows.length, `${at} 折成幾行`).toBeLessThanOrEqual(3);
        expect(
          rows[rows.length - 1].split(' ').length,
          `${at} 最後一行的字數`,
        ).toBeGreaterThanOrEqual(2);
        // 行尾不留 a／in／of…（設計師 #326 審查：「Pretrial hearing in ⏎ three weeks」「Trial in ⏎ three days」）。
        rows
          .slice(0, -1)
          .forEach((r) => expect(endsBanned(r), `${at} 行尾「${r.split(' ').pop()}」`).toBe(false));
        for (const r of rows)
          expect(r, `${at} 數字和單位拆開`).not.toMatch(/(?:^|\s)(?:one|two|three|\d+)$/i);
        // 冒號前的標籤整段同一行（設計師裁定 a26de2b：「Discovery｜deadline:｜two weeks」）。
        const label = rows.join(' ').match(/^(.+?:)/)?.[1];
        if (label)
          expect(
            rows.some((r) => r.includes(label)),
            `${at} 標籤「${label}」拆開`,
          ).toBe(true);
      }
  });
