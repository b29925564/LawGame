/// <reference lib="dom" />
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
const HUNG = JSON.parse(
  readFileSync(new URL('./fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, unknown> & { scenes: Record<string, unknown> }>;

type Hit = Record<string, unknown>;
type Rule1Result = { over: Hit[]; menu: Hit[]; cut: Hit[]; btn: Hit[]; overlap: Hit[] };

type Seed = 'blank' | 'clear' | 'vd' | 'closing' | 'hung' | 'board1' | 'board2';
/** [集, 場, 名稱, 進場步數, 存檔種子]；前面是 c/r8-scan.js 的 38 個點，後面是 scan14 的兩塊證據板。 */
const SCENES: [string, number, string, number, Seed][] = [
  ['ep1', 0, '冷開場', 0, 'blank'],
  ['ep1', 0, '冷開場2233', 1, 'blank'],
  ['ep1', 0, '冷開場2241', 2, 'blank'],
  ['ep1', 0, '冷開場訊息', 3, 'blank'],
  ['ep1', 0, '冷開場叫車', 4, 'blank'],
  ['ep1', 0, '冷開場上車', 5, 'blank'],
  ['ep1', 0, '冷開場對話選項', 6, 'blank'],
  ['ep1', 1, '集名卡', 0, 'blank'],
  ['ep1', 2, '對話', 0, 'blank'],
  ['ep1', 4, '訪談', 0, 'blank'],
  ['ep1', 7, '桌面', 0, 'blank'],
  ['ep1', 10, '取證', 0, 'blank'],
  ['ep1', 11, '協商', 0, 'blank'],
  ['ep1', 13, '案件理論', 0, 'blank'],
  ['ep1', 15, '選陪審團', 0, 'blank'],
  ['ep1', 16, '開場陳述', 0, 'blank'],
  ['ep1', 17, '交互詰問', 0, 'blank'],
  ['ep1', 22, '辯方', 0, 'blank'],
  ['ep1', 26, '結辯', 0, 'blank'],
  ['ep2', 0, '冷開場', 0, 'blank'],
  ['ep2', 0, '冷開場赫克托', 1, 'blank'],
  ['ep2', 0, '冷開場派單', 4, 'blank'],
  ['ep2', 4, '訪談', 0, 'blank'],
  ['ep2', 6, '桌面', 0, 'blank'],
  ['ep2', 8, '取證', 0, 'blank'],
  ['ep2', 9, '取證對方', 0, 'blank'],
  ['ep2', 11, '幕卡', 0, 'blank'],
  ['ep2', 12, '調解', 0, 'blank'],
  ['ep2', 14, '案件理論', 0, 'blank'],
  ['ep2', 15, '選陪審團', 0, 'clear'],
  ['ep2', 16, '開場陳述', 0, 'vd'],
  ['ep2', 17, '交互詰問', 0, 'vd'],
  ['ep2', 21, '結辯', 0, 'closing'],
  ['ep2', 22, '尾聲對話', 0, 'hung'],
  ['ep2', 30, '尾聲來電', 0, 'hung'],
  ['ep2', 30, '尾聲來電通知', 2, 'hung'],
  ['ep2', 30, '尾聲來電回覆', 3, 'hung'],
  ['ep2', 30, '尾聲來電選項', 4, 'hung'],
  ['ep1', 7, '證據板', 0, 'board1'],
  ['ep2', 10, '證據板', 0, 'board2'],
];

const desk = {
  hours: 20,
  timeline: [],
  spent: 4,
  marked: [],
  readDocs: [],
  jobs: [],
  mail: [],
  openMail: [],
  link: { cards: [], relation: null },
  found: [],
  badLinks: 0,
  linkNote: null,
  attempts: {},
  confirmed: [],
  submissions: 0,
  wrong: 0,
  report: [],
  feedback: {},
  motions: {},
  flags: [],
  wrapped: false,
};
function progressOf(ep: string, scene: number, step: number, seed: Seed) {
  if (seed === 'blank') {
    const choices = ep === 'ep1' ? { 'cold-open': { 3: 0, 6: 1 } } : { 'cold-open': { 4: 1 } };
    return { episode: ep, scene, step, choices, cards: [], flags: [], ethics: [], scenes: {} };
  }
  if (seed === 'board1')
    return {
      episode: 'ep1',
      scene: 7,
      step: 0,
      choices: {},
      flags: [],
      ethics: [],
      cards: [
        'ethan-accused',
        'ethan-ride',
        'ethan-message',
        'indictment',
        'watch-listed',
        'access-partial',
        'sophie-home',
        'ride-receipt',
        'watch-notice',
        'car-statement',
        'watch-photo',
      ],
      scenes: { investigate: { ...desk } },
    };
  if (seed === 'board2')
    return {
      episode: 'ep2',
      scene: 10,
      step: 0,
      choices: {},
      flags: [],
      ethics: [],
      cards: [
        'contract',
        'voice-memo',
        'rating-penalty',
        'trevor-sworn',
        'change-ticket',
        'lock-spec',
      ],
      scenes: { pretrial: { ...desk, found: ['l-perjury'] } },
    };
  const hung = HUNG.ep2;
  const sc = hung.scenes;
  const keep =
    seed === 'clear'
      ? {}
      : seed === 'vd'
        ? { 'voir-dire': sc['voir-dire'] }
        : seed === 'closing'
          ? Object.fromEntries(Object.entries(sc).filter(([k]) => k !== 'closing'))
          : sc;
  return { ...hung, scene, step, scenes: keep };
}

/** 尺寸：第一級 1366、412 在 PR 跑；1530、1920、390 只在全站掃描跑（1920 也被 TIER23 擋）。 */
const SIZES = [
  { name: '1366', viewport: { width: 1366, height: 768 }, mobile: false, fast: true },
  { name: '412', viewport: { width: 412, height: 915 }, mobile: true, fast: true },
  { name: '1530', viewport: { width: 1530, height: 860 }, mobile: false, fast: false },
  { name: '1920', viewport: { width: 1920, height: 1080 }, mobile: false, fast: false },
  { name: '390', viewport: { width: 390, height: 844 }, mobile: true, fast: false },
];
/** PR 快速層只走前幾步；全站掃描每個點往下走到 8 步。 */
const FAST = process.env.E2E_TIER === 'fast';
const STEPS = FAST ? 3 : 8;

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

async function enter(page: Page, ep: string, scene: number, step: number, seed: Seed) {
  const save = JSON.stringify({
    version: 5,
    savedAt: Date.now(),
    label: 'x',
    progress: progressOf(ep, scene, step, seed),
  });
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('lawgame-ep-auto', s);
    localStorage.setItem('lawgame-lang', 'zh');
    localStorage.setItem('rd.dev.intro', '0');
  }, save);
  await page.goto('/');
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  await page.waitForTimeout(600);
  if (seed === 'board1' || seed === 'board2') {
    if (await page.locator('.place-beat').count())
      await page.locator('.place-beat').first().click();
    await page.waitForTimeout(3000);
    await page
      .getByRole('button', { name: /^證據板/ })
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForTimeout(900);
    const q = page.locator('.q-item:not(.done):not(.timeline-entry)').first();
    if (await q.isVisible()) await q.click();
    await page.locator('.cork').first().waitFor({ timeout: 15000 });
  }
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
