/// <reference lib="dom" />
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { enter, SCENES, SIZES, STEPS, FAST } from './scan/scenes';
import { expect, test, type Page } from '@playwright/test';

/**
 * 規則 1（v93 排字規則）全站掃描：字不出框、不被切、不和別的字／按鈕／有框盒子重疊、
 * 離選單鈕和其他按鈕至少 8 px。pipeline/process-v2.md 第 5 節第 1 項，從第二道關卡的
 * qa/gate2/b/work14/scan14.js（加上 c/r8-scan.js 的場景清單）搬進 CI，判定本體 e2e/rule1/rules8.cjs 原樣照搬。
 *
 * 判讀照關卡的慣例（qa/gate2/README.md 第 1 項）：
 * - cut 裡標 scroll:true 的（捲動框裡捲出去的那一行）不算；
 * - btn 只算「按鈕旁邊的字」（other 以 text: 開頭）；按鈕和按鈕、按鈕和盒子的距離是另一個未決問題，不擋。
 *
 * 分層：標題含 1366／412 的是第一級組合，PR 快速層就跑；其他尺寸（1530、1920、390）只在合併後的全站掃描跑。
 * 每個尺寸只在一個 project 跑（viewport 自己設），不重複。
 */
const require = createRequire(import.meta.url);
const rules8 = require('./rule1/rules8.cjs') as (n: unknown) => Rule1Result;
const NM = JSON.parse(readFileSync(new URL('./rule1/names7.json', import.meta.url), 'utf8'));
const NAMES = {
  all: [...NM.en, ...NM.zh, ...NM.ords].sort((a: string, b: string) => b.length - a.length),
  keepInner: NM.keepInner,
};
type Hit = Record<string, unknown>;
type Rule1Result = { over: Hit[]; menu: Hit[]; cut: Hit[]; btn: Hit[]; overlap: Hit[] };

/**
 * 不算的幾類（第二道關卡 7c324bb result-b §2「以前就不算的幾類」，每一類都有截圖存證）：
 * - 手機框（冷開場、尾聲來電）：狀態列的時間畫在手機螢幕上，量起來和螢幕框重疊；
 * - 幕卡、集末卡：「第 n 幕／第 n 集」和大標的行框疊在一起（字本身沒碰到，大標行高大）；
 * - 證據板：黏在下面的答案區（標號「3」、提交鈕）蓋住捲到它後面的連線板、牌架。
 * 另外一類是量法本身的誤判：同一段字裡的子元素（結辯頂列「論點 0/0」的數字）和外面那段算成兩塊互相重疊。
 */
const STICKY = /step\.answer|answer-bar/;
const accepted = (h: Hit) => {
  const [a, c] = [String(h.asel ?? h.bsel ?? ''), String(h.csel ?? h.osel ?? '')];
  if (/phone-status/.test(a + c)) return '手機狀態列';
  if (/act-kick/.test(a + c) && /act-title/.test(a + c)) return '幕卡疊字';
  if (
    STICKY.test(a) ||
    STICKY.test(c) ||
    /step\.answer|slot-card/.test(String(h.c ?? h.other ?? ''))
  )
    return '證據板黏住的答案區';
  // 選擇器只記最後 4 層，兩邊的起點不一樣：看一邊的最後一層有沒有出現在另一邊的路徑中間。
  const tail = (x: string) => x.split('>').pop() + '>';
  if (c.includes(tail(a)) || a.includes(tail(c))) return '同一段字的子元素';
  return null;
};
/**
 * 已知、已開 Issue 等修的（不擋，但留在報告裡）：用「種類｜按鈕或字的選擇器｜另一邊的選擇器」比對。
 * 裁定以後：算問題就修掉並從這裡拿掉；不算就搬到上面 accepted。
 */
const KNOWN: Record<string, string> = {};
const sig = (kind: string, h: Hit) =>
  [kind, h.asel ?? h.bsel ?? h.sel, h.csel ?? h.osel ?? ''].join('|');

/** 把關卡慣例「不算」的去掉，剩下的就是違規。 */
function violations(m: Rule1Result) {
  return {
    over: m.over,
    menu: m.menu,
    cut: m.cut.filter((c) => !c.scroll),
    btn: m.btn.filter((b) => String(b.other).startsWith('text:') && !accepted(b)),
    overlap: m.overlap.filter((o) => !accepted(o)),
  };
}

async function measure(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
  // 換成後備字型量出來的換行是錯的：真字型沒載到就讓測試失敗，不要默默量錯。
  const fonts = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
  );
  expect(fonts, '中文字型要載到').toContain('Noto Sans TC');
  return violations(await page.evaluate(rules8, NAMES));
}

// 每條測試各自獨立：讓 CI 的 4 份分片按測試平均分，不要整支檔案都落在同一份（第一次上 CI 時 e2e 第 3 份多跑 6 分鐘）。
test.describe.configure({ mode: 'parallel' });

for (const sz of SIZES) {
  test.describe(`規則 1 掃描 ${sz.name}`, () => {
    test.use({
      viewport: sz.viewport,
      isMobile: sz.mobile,
      hasTouch: sz.mobile,
      deviceScaleFactor: sz.mobile ? 2 : 1,
    });
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, info) =>
      test.skip(info.project.name !== 'desktop', '每個尺寸只跑一次（viewport 自己設）'),
    );
    test.skip(FAST && !sz.fast, '第一級以外的尺寸只在合併後的全站掃描跑');
    for (const [ep, scene, label, step, seed] of SCENES) {
      test(`${ep} 第 ${scene} 場 ${label}（步 ${step}）`, async ({ page }) => {
        test.setTimeout(120_000);
        await enter(page, ep, scene, step, seed);
        const board = seed.startsWith('board');
        const found: Record<string, unknown>[] = [];
        for (let k = 0; k < (board ? 1 : STEPS); k++) {
          await page.waitForTimeout(1300);
          const pb = page.locator('.place-beat:visible');
          if (!board && (await pb.count())) {
            await pb.first().click();
            continue;
          }
          const v = await measure(page);
          for (const [kind, list] of Object.entries(v))
            for (const h of list) {
              const known = KNOWN[sig(kind, h)];
              if (known) test.info().annotations.push({ type: '已知', description: known });
              else found.push({ k, kind, ...h });
            }
          if (process.env.RULE1_SHOTS && Object.values(v).some((l) => l.length))
            await page.screenshot({
              path: `${process.env.RULE1_SHOTS}/${sz.name}-${ep}-${scene}-${label}-k${k}.png`,
            });
          const c = page.getByRole('button', { name: /^繼續$/ }).filter({ visible: true });
          if (!(await c.count())) break;
          await c.first().click();
        }
        expect(found, `規則 1（${sz.name}，${ep} 第 ${scene} 場 ${label}）`).toEqual([]);
      });
    }
  });
}
