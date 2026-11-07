/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

/**
 * 全站窄手機放大字級的溢出掃描（設計師 e771fcf：這輪 1、3、4、5 都是新的換行規則在窄寬度、大字級時出的事）。
 * 320／360 寬 × 介面和字幕字級 125／150% × 中英，每一種場景類型讀檔進去（定場點掉）：
 * 頁面不被撐寬（不橫捲），畫面上每一段字都在視窗裡（不被切到右邊外面）。
 * 本來就會左右捲的區塊（overflow-x auto／scroll）裡的字不算。
 */
const SCENES: [string, number, string, number?][] = [
  ['ep1', 0, '冷開場'],
  ['ep1', 0, '冷開場 22:33 黑底字卡', 1],
  ['ep1', 1, '集名卡'],
  ['ep1', 2, '對話'],
  ['ep1', 4, '訪談'],
  ['ep1', 7, '桌面'],
  ['ep1', 10, '取證'],
  ['ep1', 11, '協商'],
  ['ep1', 13, '案件理論'],
  ['ep1', 15, '選陪審團'],
  ['ep1', 16, '開場陳述'],
  ['ep1', 17, '交互詰問'],
  ['ep1', 22, '辯方'],
  ['ep1', 26, '結辯'],
  ['ep2', 0, '冷開場'],
  ['ep2', 4, '訪談'],
  ['ep2', 6, '桌面'],
  ['ep2', 8, '取證'],
  ['ep2', 12, '調解'],
  ['ep2', 14, '案件理論'],
  ['ep2', 17, '交互詰問'],
];

async function open(
  page: Page,
  episode: string,
  scene: number,
  lang: string,
  scale: number,
  step = 0,
) {
  await page.goto('/');
  await page.evaluate(
    ([episode, scene, lang, scale, step]) => {
      localStorage.clear();
      localStorage.setItem('lawgame-lang', lang as string);
      localStorage.setItem(
        'lawgame-settings',
        JSON.stringify({ state: { textScale: scale, voScale: scale }, version: 1 }),
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
            step,
            choices: { 'cold-open': { 3: 0, 6: 1 } },
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [episode, scene, lang, scale, step] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  await page.waitForTimeout(400);
  const beat = page.locator('.place-beat');
  if (await beat.count()) await beat.click({ timeout: 3000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

/** 視窗裡超出左右邊的字（本來就橫捲的區塊、看不見的元素不算）。 */
const spill = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const scrolls = (e: Element | null): boolean => {
      for (let x = e; x && x !== document.body; x = x.parentElement) {
        const cs = getComputedStyle(x);
        if (/auto|scroll/.test(cs.overflowX) && x.scrollWidth > x.clientWidth) return true;
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return true;
        if (x.closest('[aria-hidden="true"], [inert]')) return true;
      }
      return false;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      r.selectNodeContents(n);
      for (const q of r.getClientRects()) {
        if (!q.width || !q.height) continue;
        if (q.right > vw + 1 || q.left < -1) {
          if (!scrolls(n.parentElement))
            out.push(
              `${n.textContent.trim().slice(0, 30)}（${Math.round(q.left)}–${Math.round(q.right)}）`,
            );
          break;
        }
      }
    }
    return {
      page: document.documentElement.scrollWidth,
      view: vw,
      spill: [...new Set(out)],
    };
  });

for (const w of [320, 360])
  for (const scale of [1.25, 1.5])
    for (const lang of ['zh', 'en'] as const)
      test(`全站窄手機不溢出：${w} 寬・${scale * 100}%・${lang}`, async ({ page }, info) => {
        test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
        test.setTimeout(180_000);
        await page.setViewportSize({ width: w, height: 740 });
        for (const [ep, scene, name, step] of SCENES) {
          await open(page, ep, scene, lang, scale, step);
          const m = await spill(page);
          const at = `${ep} ${name}（scene ${scene}）`;
          expect.soft(m.page, `${at} 頁面被撐寬`).toBeLessThanOrEqual(m.view);
          expect.soft(m.spill, `${at} 字跑出視窗`).toEqual([]);
        }
      });

/**
 * 黑底字卡的時刻列（「22:33」和後面那條細線）不碰右上角的選單鈕：內容上緣至少在選單鈕下緣再下 8px，放不下就捲動
 * （設計師 #325 審查：320 中文 150%，22:33 那張多兩行，整塊被推到選單鈕那一排）。
 */
const CINE: [string, number][] = [
  ['ep1', 0],
  ['ep1', 1],
  ['ep1', 11],
  // ep1 12、14（23:14 港邊公車亭）v94 起有底圖，是字幕卡不是黑底字卡（cold-open-plate.spec.ts 量）。
  ['ep2', 0],
  ['ep2', 5],
  ['ep2', 6],
];
for (const [w, h] of [
  [320, 640],
  [360, 740],
] as const)
  for (const scale of [1.25, 1.5])
    for (const lang of ['zh', 'en'] as const)
      test(`黑底字卡的時刻列不碰選單鈕：${w}×${h}・${scale * 100}%・${lang}`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'chromium', '自己設視窗大小，手機那一組跑就好');
        test.setTimeout(120_000);
        await page.setViewportSize({ width: w, height: h });
        for (const [ep, step] of CINE) {
          await page.goto('/');
          await page.evaluate(
            ([ep, step, lang, scale]) => {
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
                    episode: ep,
                    scene: 0,
                    step,
                    choices: { 'cold-open': ep === 'ep1' ? { 3: 0, 6: 1 } : { 4: 1 } },
                    cards: [],
                    flags: [],
                    ethics: [],
                    scenes: {},
                  },
                }),
              );
            },
            [ep, step, lang, scale] as const,
          );
          await page.reload();
          await page
            .getByRole('button', { name: /^(繼續|Continue)/ })
            .first()
            .click();
          await expect(page.locator('.cine .cine-time')).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(700);
          const m = await page.evaluate(() => {
            const a = document.querySelector('.cine .cine-time')!.getBoundingClientRect();
            const b = document.querySelector('.menu-toggle')!.getBoundingClientRect();
            return {
              time: a.top,
              menu: b.bottom,
              text: document.querySelector('.cine-time')!.textContent,
            };
          });
          expect
            .soft(m.time - m.menu, `${ep} 第 ${step} 步（${m.text}）時刻列上緣到選單鈕下緣`)
            .toBeGreaterThanOrEqual(8);
        }
      });
