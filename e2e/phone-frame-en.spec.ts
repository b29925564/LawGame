/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { endsBanned } from '../src/ui/plateBreaks';
import { EN_NAMES } from '../src/ui/enNames';

/**
 * 冷開場手機框（英文，設計師裁定 a26de2b）：
 * - 行尾不留 a／the／of…（「still at the ⏎ office」），專有名詞不拆。
 * - 收回訊息的黑條標籤跟著泡泡寬，最多兩行（320／360 150% 曾經「This｜message｜was｜unsent」一個字一行）。
 * 步驟：2 通知、3 回覆選項、4 叫車、5 對話、6 回覆選項（對話）、7 對話、8 刷卡、9 門、13 收回。
 */
const STEPS = [2, 3, 4, 5, 6, 7, 8, 9, 13];
const TEXT =
  '.phone-body > p, .notif > span:not(.notif-app), .bubble:not(.retracted), .ride-route dd, .subtitles li > span, .replies button, .redact-label';

async function open(page: Page, step: number, scale: number) {
  await page.goto('/');
  await page.evaluate(
    ([step, scale]) => {
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
            episode: 'ep1',
            scene: 0,
            step,
            choices:
              step <= 3
                ? {}
                : step <= 6
                  ? { 'cold-open': { 3: 0 } }
                  : { 'cold-open': { 3: 0, 6: 0 } },
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [step, scale] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^Continue/ })
    .first()
    .click();
  await expect(page.locator('.phone')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}

for (const w of [320, 360, 412])
  for (const scale of [1, 1.25, 1.5])
    test(`冷開場手機框（英文）：行尾沒有虛詞、專有名詞不拆、收回標籤最多兩行（${w} 寬・${scale * 100}%）`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
      await page.setViewportSize({ width: w, height: w > 400 ? 915 : 640 });
      let redacted = 0;
      for (const step of STEPS) {
        await open(page, step, scale);
        const got = await page.locator(TEXT).evaluateAll((els) =>
          els.map((el) => {
            const rows: string[] = [];
            let cur = '';
            let lastTop: number | null = null;
            const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n = walk.nextNode(); n; n = walk.nextNode()) {
              const s = n.textContent ?? '';
              for (let i = 0; i < s.length; i++) {
                const r = document.createRange();
                r.setStart(n, i);
                r.setEnd(n, i + 1);
                const rc = r.getClientRects()[0];
                if (rc && rc.width && lastTop !== null && rc.top > lastTop + 6) {
                  rows.push(cur);
                  cur = '';
                }
                if (rc && rc.width) lastTop = rc.top;
                cur += s[i];
              }
            }
            rows.push(cur);
            return {
              label: el.classList.contains('redact-label'),
              rows: rows.map((x) => x.replace(/\u00a0/g, ' ').trim()).filter(Boolean),
              over: el.scrollWidth > el.clientWidth + 1,
            };
          }),
        );
        expect(got.length, `第 ${step} 步 框裡有字`).toBeGreaterThan(0);
        for (const { label, rows, over } of got) {
          const t = rows.join(' ');
          expect.soft(over, `第 ${step} 步「${t}」超出框`).toBe(false);
          for (const r of rows.slice(0, -1))
            expect
              .soft(endsBanned(r.split(' ').at(-1)!), `第 ${step} 步 行尾是虛詞：「${r}｜」`)
              .toBe(false);
          for (let i = 1; i < rows.length; i++)
            for (const n of EN_NAMES) {
              const [a, b] = [rows[i - 1], rows[i]];
              const split = n
                .split(' ')
                .some(
                  (_, k, ws) =>
                    k > 0 &&
                    a.endsWith(ws.slice(0, k).join(' ')) &&
                    b.startsWith(ws.slice(k).join(' ')),
                );
              expect.soft(split, `第 ${step} 步 拆開了 ${n}：「${a}｜${b}」`).toBe(false);
            }
          if (label) {
            redacted++;
            expect.soft(rows.length, `收回標籤「${t}」`).toBeLessThanOrEqual(2);
          }
        }
      }
      expect(redacted, '第 13 步有收回的黑條').toBeGreaterThan(0);
    });
