/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { fitLineUnits } from '../src/ui/lineUnits';

/**
 * 第二道關卡 dd50064（qa/gates/2026-11-07-gate2-dd50064.md）擋件：第 2 集第 19 場證人身分列把「急診科」拆成
 * 「急診 ⏎ 科主治醫師」（#331 的「・」分段帶出來的）。關卡建議全站身分列再掃一遍：
 * 法庭證人、取證、協商／調解的對手、會見的來電資訊，320／360 × 100／125／150%，中文。
 * 規則：畫面上的每一個換行，都要落在整串身分列的換行單位之間，或「・」的前後。
 */
async function open(page: Page, episode: string, scene: number, scale: number, sel: string) {
  await page.goto('/');
  await page.evaluate(
    ([episode, scene, scale]) => {
      localStorage.clear();
      localStorage.setItem('lawgame-lang', 'zh');
      localStorage.setItem('rd.dev.intro', '0');
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
    [episode, scene, scale] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page.evaluate(() => document.fonts.ready);
  // 地點卡（有的場才有）、取證「開始錄取」、協商／調解「坐下」、法庭「開庭」：
  // 等畫面上出現其中一個再點，直到身分列出現。不要固定等地點卡 3 秒：沒有地點卡的場每次白等，
  // 一條測試開 6 次就吃掉 18 秒，CI 負載高時超過 30 秒上限（#343 CI）。
  for (let k = 0; k < 8; k++) {
    await page
      .locator(`${sel}, .place-beat, button.primary:visible`)
      .first()
      .waitFor({ timeout: 5000 })
      .catch(() => {});
    if (await page.locator(sel).count()) break;
    if (await page.locator('.place-beat').count()) await page.locator('.place-beat').click();
    else await page.locator('button.primary:visible').last().click();
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => document.fonts.ready);
}

/** 畫面上的每一行（以字的上下中線分組），去掉空白；和整串的文字（不斷行空格換回空白）。 */
const linesOf = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => {
      const rows = new Map<number, string>();
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const s = n.textContent ?? '';
        for (let i = 0; i < s.length; i++) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 1);
          const b = r.getBoundingClientRect();
          if (b.height < 0.5 || /\s/.test(s[i])) continue;
          const mid = Math.round((b.top + b.bottom) / 2 / 6);
          rows.set(mid, (rows.get(mid) ?? '') + s[i]);
        }
      }
      return {
        rows: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t),
        text: (el.textContent ?? '').replace(/\u00a0/g, ' '),
      };
    });

/** 換行不在單位之間、也不在「・」旁邊的地方（去掉空白後的位置）。 */
function badBreaks(rows: string[], text: string) {
  const ok = new Set<number>();
  let i = 0;
  for (const u of fitLineUnits(text)) ok.add((i += u.replace(/\s/g, '').length));
  const flat = text.replace(/\s/g, '');
  for (let k = 0; k < flat.length; k++) if (flat[k] === '・') [k, k + 1].forEach((x) => ok.add(x));
  const bad: string[] = [];
  let at = 0;
  for (const r of rows.slice(0, -1)) {
    at += r.length;
    if (!ok.has(at)) bad.push(`${flat.slice(Math.max(0, at - 4), at)}｜${flat.slice(at, at + 4)}`);
  }
  return bad;
}

const ROWS: [ep: string, scene: number, sel: string, what: string][] = [
  ['ep1', 4, '.call .muted', '會見 伊森'],
  ['ep1', 10, '.panel-head.bench .eyebrow', '取證 瑞秋'],
  ['ep1', 11, '.panel-head.bench .eyebrow', '協商 莫羅'],
  ['ep1', 17, '.panel-head.bench .eyebrow', '法庭 柯瓦斯基'],
  ['ep1', 19, '.panel-head.bench .eyebrow', '法庭 蘇菲'],
  ['ep1', 20, '.panel-head.bench .eyebrow', '法庭 瑞秋'],
  ['ep2', 4, '.call .muted', '會見 崔佛'],
  ['ep2', 8, '.panel-head.bench .eyebrow', '取證 崔佛'],
  ['ep2', 9, '.panel-head.bench .eyebrow', '取證 艾瑪'],
  ['ep2', 12, '.panel-head.bench .eyebrow', '調解 奧卡福'],
  ['ep2', 17, '.panel-head.bench .eyebrow', '法庭 瑪莉索'],
  ['ep2', 18, '.panel-head.bench .eyebrow', '法庭 費雪'],
  ['ep2', 19, '.panel-head.bench .eyebrow', '法庭 唐醫師'],
];

for (const [ep, scene, sel, what] of ROWS)
  test(`身分列只在詞和詞之間、「・」前後換行（${ep} 第 ${scene} 場 ${what}・320／360・中文 100／125／150%）`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
    for (const w of [320, 360]) {
      await page.setViewportSize({ width: w, height: 740 });
      for (const scale of [1, 1.25, 1.5]) {
        await open(page, ep, scene, scale, sel);
        await expect(page.locator(sel).first()).toBeVisible();
        const { rows, text } = await linesOf(page, sel);
        expect(badBreaks(rows, text), `${w}・${scale * 100}%：${rows.join('⏎')}`).toEqual([]);
      }
    }
  });

test('第 2 集第 19 場：「急診科」不拆（360・中文 125／150%）', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
  await page.setViewportSize({ width: 360, height: 740 });
  for (const scale of [1.25, 1.5]) {
    await open(page, 'ep2', 19, scale, '.panel-head.bench .eyebrow');
    const { rows } = await linesOf(page, '.panel-head.bench .eyebrow');
    expect(
      rows.some((r) => r.includes('急診科')),
      rows.join('⏎'),
    ).toBe(true);
  }
});
