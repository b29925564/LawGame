import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * 陪審團僵局的票數卡：標題列「陪審團僵局／第 3 輪 無罪 4 有罪 8／未達一致」。
 * 窄螢幕放不下一行時，一整段換到下一行，不能在詞中間斷（「僵／局」「未達一／致」）。
 * 存檔是引擎跑出來的僵局：第 1 集 8 : 4（刑事，要全體一致），第 2 集 4 : 2（民事，要 5 票）。
 */
const seeds = JSON.parse(
  readFileSync(new URL('./fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as Record<'ep1' | 'ep2', unknown>;

for (const ep of ['ep1', 'ep2'] as const)
  for (const lang of ['zh', 'en'] as const)
    test(`僵局票數卡：標題列每一段都不在中間換行（${ep}・${lang}）`, async ({ page }) => {
      await page.addInitScript(
        ([save, lang]) => {
          if (sessionStorage.getItem('seeded')) return;
          sessionStorage.setItem('seeded', '1');
          localStorage.clear();
          localStorage.setItem('lawgame-ep-auto', save);
          if (lang === 'en') localStorage.setItem('lawgame-lang', 'en');
        },
        [
          JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: seeds[ep] }),
          lang,
        ],
      );
      await page.goto('/');
      await page
        .getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ })
        .first()
        .click();
      const head = page.locator('.tally-head');
      await expect(head).toBeVisible();
      const parts = await head.evaluate((h) =>
        [...h.children].map((c) => {
          const r = h.ownerDocument.createRange();
          r.selectNodeContents(c);
          const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
          const box = c.getBoundingClientRect();
          const out = h.getBoundingClientRect();
          return { text: c.textContent, lines, inside: box.right <= out.right + 0.5 };
        }),
      );
      expect(parts).toHaveLength(3);
      for (const p of parts) expect(p, p.text ?? '').toMatchObject({ lines: 1, inside: true });
    });
