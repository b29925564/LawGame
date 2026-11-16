/* #225 第三輪送審的補拍（2026-11-16 從 qa/tests 搬進 repo，全站掃描用）。R225=輸出目錄 時，各截圖點與 tick() 會照下面的清單多拍。 */
import type { Page } from '@playwright/test';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { setLangVia } from './extra';

const DIR = process.env.R225 ?? '';
const EP = () => process.env.R225_EP ?? 'ep1';
const proj = (page: Page) => (page.viewportSize()!.width > 900 ? 'wide' : 'phone');
const note = (s: string) => appendFileSync(`${DIR}/notes.txt`, s + '\n');

/** 中英文各一張；dark：另拍一張深色（中文）；full：整頁。 */
async function both(
  page: Page,
  name: string,
  { dark = false, full = true, langs = ['zh', 'en'] } = {},
) {
  mkdirSync(DIR, { recursive: true });
  const p = proj(page);
  // 地點字卡停 2.5 秒才淡出（設定集 11.3）：等它走完再拍，不然會蓋在名單上（設計師第二輪）。
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('.place-slate')].every(
          (e) => +getComputedStyle(e).opacity < 0.05,
        ),
      null,
      { timeout: 4000 },
    )
    .catch(() => {});
  for (const lang of langs) {
    if (lang === 'en') await setLangVia(page, 'en');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${DIR}/${EP()}-${name}-${lang}-${p}.png`, fullPage: full });
    if (dark && lang === 'zh') {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${EP()}-${name}-dark-${p}.png`, fullPage: full });
      await page.emulateMedia({ colorScheme: 'light' });
    }
  }
  if (langs.includes('en')) await setLangVia(page, 'zh-Hant');
  await page.waitForTimeout(300);
}

const SECONDARY = [
  '普莉亞・奈爾',
  '奧瑪・哈桑',
  '亞瑟・卡爾德',
  '崔佛・米爾斯',
  '丹尼爾・奧卡福',
  '瑪莉索・維加',
  '喬安娜・費雪醫師',
  '麥可・唐醫師',
];
const seen = new Set<string>();
/** 推進劇情時每一步呼叫：法庭說話列第一次出現某位次要角色的剪影，就拍中英文（視窗大小，不整頁）。 */
export async function tick(page: Page) {
  if (!DIR) return;
  // 剪影不再有標籤（11-16）：說話者名字在台詞那一行（.speech .who）或手機法庭的說話者列（.court-now > .who）。
  const names = await page
    .locator('.speech .who, .court-now > .who')
    .allTextContents()
    .catch(() => []);
  for (const n of names)
    if (SECONDARY.includes(n) && !seen.has(n)) {
      seen.add(n);
      note(`[說話者] ${EP()} ${proj(page)} ${n}`);
      await page
        .locator('.speech:has(.portrait.sil), .court-now')
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await both(page, `speaker-${n}`, { full: false });
    }
}

/** 截圖點的補拍。 */
export async function at(page: Page, name: string) {
  if (!DIR) return;
  const base = name.replace(/^\d+-/, '');
  await tick(page);
  // 每個截圖點都存一份存檔（localStorage），第四輪之後改一處只要從這裡接著跑。
  const dump = await page.evaluate(() => JSON.stringify({ ...localStorage })).catch(() => '');
  if (dump) {
    mkdirSync(`${DIR}/saves`, { recursive: true });
    writeFileSync(`${DIR}/saves/${EP()}-${base}-${proj(page)}.json`, dump);
  }
  // R225_ONLY＝只補這幾個截圖點（逗號分隔；speakers＝只拍次要說話者）。
  const only = process.env.R225_ONLY?.split(',');
  if (only && !only.includes(base)) return;
  switch (base) {
    case 'motion-denied': {
      await both(page, 'motion-denied');
      // 除錯圖：格線加深成紅色，看每一行的基線是不是坐在格線上（設計師第三輪）。
      await page.addStyleTag({
        content: `.plead{background-image:var(--grain),repeating-linear-gradient(to bottom,transparent 0 31px,rgb(220 0 0 / 70%) 31px 32px)!important}`,
      });
      await both(page, 'motion-denied-grid');
      await page.evaluate(() =>
        document
          .querySelectorAll('style')
          .forEach((s) => s.textContent?.includes('rgb(220 0 0') && s.remove()),
      );
      return;
    }
    case 'nego':
    case 'mediation-table': {
      const tab = page.getByRole('button', { name: /^(她|對方)開的條件$/ });
      if (await tab.isVisible().catch(() => false)) await tab.click();
      return both(page, 'nego-her-terms');
    }
    case 'theory':
    case 'theory-intro':
      return both(page, base);
    case 'voirdire': {
      await both(page, 'voirdire', { dark: true });
      const cut = page.locator('.cutline').first();
      if (await cut.count()) {
        await cut.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -120));
        await both(page, 'voirdire-cutline', { dark: true, full: false });
      }
      return;
    }
    case 'opening':
    case 'opening-1of2':
    case 'opening-2of2':
      return both(page, base);
    case 'court-k':
    case 'court-s':
    case 'court-r':
    case 'cross':
    case 'trevor':
    case 'trevor-cross':
      return both(page, base, { dark: true });
    case 'court-live':
      await both(page, base, { dark: true, full: false });
      return stampShot(page, base);
    case 'k-done':
    case 'r-done':
    case 'cross-done': {
      await both(page, base, { dark: true });
      return stampShot(page, base);
    }
    case 'closing-picked': {
      const tabs = page.locator('nav button');
      await tabs.nth(0).click();
      await both(page, 'closing-args', { dark: true });
      await tabs.nth(1).click();
      // 捲到基調選項（第三輪：選項被捲到框外）：看得到選中的和沒選的。
      await page
        .locator('.closing-tones')
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await page
        .locator('.closing-tones')
        .first()
        .evaluate((e) => e.scrollIntoView({ block: 'center' }))
        .catch(() => {});
      return both(page, 'closing-tone', { dark: true, full: false });
    }
    case 'verdict': {
      await both(page, 'verdict', { dark: true });
      const sum = page.locator('details summary', { hasText: /完整帳目/ }).first();
      if (await sum.count()) {
        await sum.click();
        await both(page, 'verdict-ledger');
        // 「顯示數值」打開：帳目裡多一行理論起點與陪審團寫下的過失比例。
        if (await setNumbers(page, true)) {
          await both(page, 'verdict-ledger-numbers');
          await setNumbers(page, false);
        } else note('[判決] 找不到「顯示陪審員數值」');
      }
      return;
    }
    case 'epilogue':
      return both(page, 'epilogue');
    case 'end':
      return both(page, 'end');
  }
}

/** 筆錄裡的英文裁定章：捲到第一枚章，拍視窗（看章有沒有蓋到行尾）。 */
async function stampShot(page: Page, base: string) {
  await setLangVia(page, 'en');
  await page.waitForTimeout(600);
  const st = page.locator('.rec-stamp');
  const n = await st.count();
  note(`[章] ${EP()} ${proj(page)} ${base}：${n} 枚`);
  for (let i = 0; i < Math.min(n, 3); i++) {
    await st.nth(i).evaluate((e) => {
      // 收合的「前面的證詞」裡的章：先打開。
      for (let d = e.closest('details'); d; d = d.parentElement?.closest('details') ?? null)
        d.open = true;
      e.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(300);
    const info = await st.nth(i).evaluate((e) => {
      const row = e.closest('.rec-row') as HTMLElement;
      const r = e.getBoundingClientRect();
      return `${e.className} 章 ${Math.round(r.left)}–${Math.round(r.right)}；行 ${row.innerText.replace(/\s+/g, ' ').slice(0, 60)}`;
    });
    note(`  ${info}`);
    await page.screenshot({ path: `${DIR}/${EP()}-${base}-stamp${i + 1}-en-${proj(page)}.png` });
  }
  await setLangVia(page, 'zh-Hant');
}

/** 選單→設定分頁→「顯示陪審員數值」。 */
async function setNumbers(page: Page, on: boolean) {
  const y = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollTo(0, 0));
  const toggle = page.locator('.menu-toggle');
  if (!(await toggle.isVisible().catch(() => false))) return false;
  await toggle
    .click({ timeout: 3000 })
    .catch(() => toggle.evaluate((b) => (b as HTMLElement).click()));
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('tab').nth(2).click();
  const box = dlg.getByRole('checkbox', { name: /顯示陪審員數值/ });
  const ok = (await box.count()) > 0;
  if (ok) await box.setChecked(on);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
  if (await dlg.isVisible().catch(() => false))
    await toggle.evaluate((b) => (b as HTMLElement).click()).catch(() => {});
  await page.waitForTimeout(200);
  await page.evaluate((v) => window.scrollTo(0, v), y);
  // 帳目在切換後會重畫；收合的話再打開。
  const sum = page.locator('details:not([open]) summary', { hasText: /完整帳目/ }).first();
  if (await sum.count()) await sum.click();
  return ok;
}
