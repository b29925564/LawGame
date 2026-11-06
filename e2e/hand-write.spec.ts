import { expect, test, type Page } from '@playwright/test';

/**
 * 便利貼的手寫一格一字（設定集）：每一格只出現完整的字，不能露出半個字或下一個字的一條邊。
 * 每個字一個 span，各自在自己那一格出現；這裡把動畫停在每一格中間，量看得到的字：
 * 剛好是前 k 個字、每個字不是全有就是全無、整行沒有剪裁（剪裁右緣不會切進字裡）。
 * 第一集會見伊森，開場那句「先讓他講。」（英文 Let him talk.，比例字寬）。
 */
async function open(page: Page, lang: 'zh' | 'en', textScale: number) {
  await page.addInitScript(
    ([lang, textScale]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      if (lang === 'en') localStorage.setItem('lawgame-lang', 'en');
      localStorage.setItem(
        'lawgame-settings',
        JSON.stringify({ state: { textScale }, version: 1 }),
      );
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep1',
            scene: 4,
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
    [lang, textScale] as const,
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ })
    .first()
    .click();
}

for (const lang of ['zh', 'en'] as const)
  for (const scale of [1, 1.5])
    test(`便利貼手寫：每一格只有完整的字（${lang}・字級 ${scale * 100}%）`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await open(page, lang, scale);
      const hand = page.locator('.sticky .hand').first();
      await expect(hand).toBeVisible();
      // 先全部停住，再一格一格往前撥。
      const n = await hand.evaluate((h) => {
        document.getAnimations().forEach((a) => a.pause());
        return h.querySelectorAll('.hw-c').length;
      });
      expect(n).toBe(lang === 'en' ? 'Let him talk.'.length : '先讓他講。'.length);
      for (let k = 0; k <= n; k++) {
        const m = await hand.evaluate((h, k) => {
          const write = parseFloat(getComputedStyle(h).getPropertyValue('--dur-write')) || 60;
          const chars = [...h.querySelectorAll<HTMLElement>('.hw-c')];
          // 第 i 個字的動畫從第 i 格開始、播完那一格才出現；停在寫好 k 個字之後的半格。
          for (const a of document.getAnimations() as CSSAnimation[]) {
            // 便利貼本身貼上來的那一下先播完，畫面上才是完整的紙。
            if (a.animationName === 'stick') a.finish();
            if (a.animationName !== 'hand-char') continue;
            const el = (a.effect as KeyframeEffect).target as HTMLElement;
            const i = chars.indexOf(el);
            const first = Number(a.effect!.getTiming().delay) - i * write;
            a.currentTime = first + (k + 0.5) * write;
          }
          const op = chars.map((c) => parseFloat(getComputedStyle(c).opacity));
          const shown = op.filter((o) => o === 1).length;
          return {
            partial: op.filter((o) => o !== 0 && o !== 1).length,
            prefix: op.every((o, i) => (i < shown ? o === 1 : o === 0)),
            shown,
            clip: getComputedStyle(h).clipPath,
          };
        }, k);
        expect(m, `第 ${k} 格`).toEqual({
          partial: 0,
          prefix: true,
          shown: Math.max(0, k),
          clip: 'none',
        });
        if (process.env.SHOTS && (k === 1 || k === 2 || k === n - 1 || k === n))
          await page
            .locator('.sticky')
            .first()
            .screenshot({
              path: `/mnt/project-files/qa/court-ui/2026-11-06-steps-end/after/hand-${info.project.name === 'chromium' ? 'p412' : 'd1440'}-${lang}-${scale * 100}-${k}of${n}.png`,
            });
      }
    });
