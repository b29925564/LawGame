import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/**
 * 全站掃描共用的進場點：規則 1（rule1.spec.ts）和無障礙名稱（a11y-names.spec.ts）走同一組狀態。
 * 場景清單來自第二道關卡的 c/r8-scan.js（38 個點）加 b/work14/scan14.js 的兩塊證據板。
 */
const HUNG = JSON.parse(
  readFileSync(new URL('../fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, unknown> & { scenes: Record<string, unknown> }>;

export type Seed = 'blank' | 'clear' | 'vd' | 'closing' | 'hung' | 'board1' | 'board2';
/** [集, 場, 名稱, 進場步數, 存檔種子]；前面是 c/r8-scan.js 的 38 個點，後面是 scan14 的兩塊證據板。 */
export const SCENES: [string, number, string, number, Seed][] = [
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
export function progressOf(ep: string, scene: number, step: number, seed: Seed) {
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

export type Size = {
  name: string;
  viewport: { width: number; height: number };
  mobile: boolean;
  /** PR 快速層跑（第一級的 1366、412）。 */
  fast: boolean;
  /** 第二、三級組合（process-v2 第 5 節第 8 項）：照跑，結果只記在報告，由 CI 開 C 級 Issue，不擋。 */
  tier23?: boolean;
  lang?: 'zh' | 'en';
  textScale?: number;
};
const DESK = { width: 1366, height: 768 };
const PHONE = { width: 412, height: 915 };
/**
 * 尺寸：第一級 1366、412 在 PR 跑；1530、1920、390 只在全站掃描跑（1920 也被 TIER23 擋）。
 * 第二、三級（英文、125／150%、360、320）也只在全站掃描跑，名稱都會被 playwright.config.ts 的 TIER23 擋在 PR 外面。
 */
export const SIZES: Size[] = [
  { name: '1366', viewport: DESK, mobile: false, fast: true },
  { name: '412', viewport: PHONE, mobile: true, fast: true },
  { name: '1530', viewport: { width: 1530, height: 860 }, mobile: false, fast: false },
  { name: '1920', viewport: { width: 1920, height: 1080 }, mobile: false, fast: false },
  { name: '390', viewport: { width: 390, height: 844 }, mobile: true, fast: false },
  { name: 'en-1366', viewport: DESK, mobile: false, fast: false, tier23: true, lang: 'en' },
  { name: 'en-412', viewport: PHONE, mobile: true, fast: false, tier23: true, lang: 'en' },
  { name: '125-1366', viewport: DESK, mobile: false, fast: false, tier23: true, textScale: 1.25 },
  { name: '150-1366', viewport: DESK, mobile: false, fast: false, tier23: true, textScale: 1.5 },
  { name: '150-412', viewport: PHONE, mobile: true, fast: false, tier23: true, textScale: 1.5 },
  { name: '360', viewport: { width: 360, height: 740 }, mobile: true, fast: false, tier23: true },
  { name: '320', viewport: { width: 320, height: 640 }, mobile: true, fast: false, tier23: true },
];
/** 「繼續」鈕：中英文都認。 */
export const CONTINUE = /^(繼續|Continue)$/;
/** PR 快速層只走前幾步；全站掃描每個點往下走到 8 步。 */
export const FAST = process.env.E2E_TIER === 'fast';
export const STEPS = FAST ? 3 : 8;

export async function enter(
  page: Page,
  ep: string,
  scene: number,
  step: number,
  seed: Seed,
  sz: Pick<Size, 'lang' | 'textScale'> = {},
) {
  const save = JSON.stringify({
    version: 5,
    savedAt: Date.now(),
    label: 'x',
    progress: progressOf(ep, scene, step, seed),
  });
  const lang = sz.lang ?? 'zh';
  const settings = sz.textScale
    ? JSON.stringify({ state: { textScale: sz.textScale, voScale: sz.textScale }, version: 1 })
    : '';
  await page.addInitScript(
    ([s, lang, settings]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', s);
      localStorage.setItem('lawgame-lang', lang);
      localStorage.setItem('rd.dev.intro', '0');
      if (settings) localStorage.setItem('lawgame-settings', settings);
    },
    [save, lang, settings],
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  await page.waitForTimeout(600);
  if (seed === 'board1' || seed === 'board2') {
    if (await page.locator('.place-beat').count())
      await page.locator('.place-beat').first().click();
    await page.waitForTimeout(3000);
    await page
      .getByRole('button', { name: /^(證據板|Board)/ })
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForTimeout(900);
    const q = page.locator('.q-item:not(.done):not(.timeline-entry)').first();
    if (await q.isVisible()) await q.click();
    await page.locator('.cork').first().waitFor({ timeout: 15000 });
  }
}
