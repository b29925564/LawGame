/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

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
        };
      });
      expect(m.text).toBe(lang === 'en' ? 'Trial in three days' : '開庭　三天後');
      expect(
        m.menu.l - m.right,
        `期限字右緣 ${m.right}，選單鈕左緣 ${m.menu.l}`,
      ).toBeGreaterThanOrEqual(8);
      expect(m.clipped, '期限字被切').toBe(false);
      expect(m.ellipsis, '不用省略號').toBe(false);
    });
