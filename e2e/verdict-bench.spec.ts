import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 判決頁開頭的法官席那一格（設計師 11-06）：
 * 掛鐘跟著結果走（兩集各三組時刻）；每一層都解碼好才硬切進來，停 max(--dur-turn, 1.5 秒)，切黑 --dur-cut-black 再到裁決書；
 * 場記只寫房間、沒有黃；略過連同四拍一起跳；減少動態照樣出這一格。
 * 存檔用 hung-jury.json（引擎跑出來的僵局），其餘結果只改 closing.verdict：這一格只看結果。
 */
const seeds = JSON.parse(
  readFileSync(new URL('./fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as Record<'ep1' | 'ep2', { scenes: { closing: { verdict: string } } }>;

const CASES = [
  { ep: 'ep1', verdict: '無罪', slot: 'verdict-e1-1640' },
  { ep: 'ep1', verdict: '有罪', slot: 'verdict-e1-164845' },
  { ep: 'ep1', verdict: '陪審團僵局', slot: 'verdict-e1-1701' },
  { ep: 'ep2', verdict: '無責', slot: 'verdict-e2-1610' },
  { ep: 'ep2', verdict: '有責', slot: 'verdict-e2-1640' },
  { ep: 'ep2', verdict: '陪審團僵局', slot: 'verdict-e2-1734' },
] as const;
const ROOM = {
  zh: { ep1: '第三法庭', ep2: '第五法庭' },
  en: { ep1: 'Courtroom 3', ep2: 'Courtroom 5' },
} as const;

async function open(page: Page, ep: 'ep1' | 'ep2', verdict: string, lang: 'zh' | 'en') {
  const progress = structuredClone(seeds[ep]);
  progress.scenes.closing.verdict = verdict;
  await page.addInitScript(
    ([save, lang]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', save);
      if (lang === 'en') localStorage.setItem('lawgame-lang', 'en');
      // 記下這一格每一段開始的時間：等圖（wait）、停（hold）、切黑（black）、裁決書（form）。
      const marks: Record<string, number> = {};
      (window as unknown as { __bench: typeof marks }).__bench = marks;
      new MutationObserver(() => {
        const b = document.querySelector('.vbench');
        const ph = b?.getAttribute('data-phase');
        if (ph && !(ph in marks)) marks[ph] = performance.now();
        if (!b && marks.black && !marks.form && document.querySelector('.vdict'))
          marks.form = performance.now();
      }).observe(document, { subtree: true, childList: true, attributes: true });
    },
    [JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress }), lang] as const,
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ })
    .first()
    .click();
}

const plateSrc = (page: Page) =>
  page.locator('.vbench .cam-stage[data-cam="bench"][data-on] .cam-plate img').first();

for (const c of CASES)
  test(`判決法官席：${c.ep} ${c.verdict} 用 ${c.slot}`, async ({ page }, info) => {
    await open(page, c.ep, c.verdict, 'zh');
    const bench = page.locator('.vbench');
    await expect(bench).toHaveAttribute('data-slot', c.slot);
    await expect(bench).toHaveAttribute('data-phase', 'hold');
    await expect(plateSrc(page)).toHaveAttribute('src', new RegExp(`bench-${c.slot}-p5[-.]`));
    // 場記和定場場記同一個版型（短槓＋地點），只寫房間；短槓是 --cine-muted，不是黃。
    const slate = page.locator('.vbench-slate');
    await expect(slate).toHaveText(ROOM.zh[c.ep]);
    const bar = await slate.evaluate((el) => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--cine-muted)';
      el.append(probe);
      const muted = getComputedStyle(probe).color;
      probe.remove();
      const b = getComputedStyle(el, '::before');
      return {
        content: b.content,
        bg: b.backgroundColor,
        muted,
        anim: getComputedStyle(el).animationName,
      };
    });
    expect(bar.content).toBe('""');
    expect(bar.bg).toBe(bar.muted);
    expect(bar.anim).toBe('none');
    if (process.env.SHOTS) {
      const dir = '/mnt/project-files/qa/court-ui/2026-11-06-verdict-bench';
      await page.screenshot({ path: `${dir}/${info.project.name}-${c.slot}-zh.png` });
    }
    // 停夠 1.5 秒，切黑一格，才是裁決書（四拍從這裡才開始）。
    await expect(page.locator('.vdict')).toHaveAttribute('data-stage', 'form');
    const m = await page.evaluate(
      () => (window as unknown as { __bench: Record<string, number> }).__bench,
    );
    expect(m.black - m.hold).toBeGreaterThanOrEqual(1500 - 20);
    expect(m.form - m.black).toBeGreaterThanOrEqual(83 - 20);
  });

test('判決法官席：英文介面讀 -en 的底圖，場記寫英文房間名', async ({ page }, info) => {
  await open(page, 'ep1', '有罪', 'en');
  await expect(page.locator('.vbench')).toHaveAttribute('data-phase', 'hold');
  await expect(plateSrc(page)).toHaveAttribute('src', /bench-verdict-e1-164845-p5-en[-.]/);
  await expect(page.locator('.vbench-slate')).toHaveText(ROOM.en.ep1);
  if (process.env.SHOTS)
    await page.screenshot({
      path: `/mnt/project-files/qa/court-ui/2026-11-06-verdict-bench/${info.project.name}-verdict-e1-164845-en.png`,
    });
});

test('判決法官席：等圖時是純黑，圖好了才切進來', async ({ page }) => {
  // 底圖晚到：這段時間只有黑，不出場記、不出立牌。
  await page.route(/bench-verdict-e2-1610-p5\.webp/, async (r) => {
    await new Promise((f) => setTimeout(f, 1200));
    await r.continue();
  });
  await open(page, 'ep2', '無責', 'zh');
  const bench = page.locator('.vbench');
  await expect(bench).toHaveAttribute('data-phase', 'wait');
  await expect(page.locator('.vbench .cam-frame')).toHaveAttribute('data-shot', 'black');
  await expect(page.locator('.vbench-slate')).toHaveCount(0);
  await expect(bench).toHaveAttribute('data-phase', 'hold', { timeout: 10_000 });
  await expect(page.locator('.vbench .cam-frame')).toHaveAttribute('data-shot', 'bench');
});

test('判決法官席：按略過，這一格連同四拍一起跳到結論', async ({ page }) => {
  await open(page, 'ep1', '無罪', 'zh');
  await expect(page.locator('.vbench')).toHaveAttribute('data-phase', 'hold');
  await page.getByRole('button', { name: '略過' }).press('Escape');
  await expect(page.locator('.vbench')).toHaveCount(0);
  await expect(page.locator('.vdict')).toHaveAttribute('data-stage', 'done');
  await expect(page.getByRole('heading', { name: /無罪/ })).toBeVisible();
});

test('判決法官席：減少動態照樣出這一格，之後直接是結論', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'ep2', '有責', 'zh');
  await expect(page.locator('.vbench')).toHaveAttribute('data-phase', 'hold');
  if (process.env.SHOTS)
    await page.screenshot({
      path: `/mnt/project-files/qa/court-ui/2026-11-06-verdict-bench/${info.project.name}-verdict-e2-1640-reduced.png`,
    });
  await expect(page.locator('.vdict')).toHaveAttribute('data-stage', 'done');
});

/** 第二、三根燈座在 1920 寬原圖上的邊（實量，六格、耐心 0–5 都一樣）：手機裁切的左緣在這中間。 */
const TUBE2_END = 555;
const TUBE3_START = 572;
/** 掛鐘直徑（bench.json inView.clock 的寬，原圖比例）。 */
const CLOCK_W = 0.0542;

for (const [w, h] of [
  [412, 915],
  [360, 740],
] as const)
  test(`判決法官席：手機 ${w} 寬，掛鐘讀得出來，裁切邊不切過燈管`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '手機版面');
    await page.setViewportSize({ width: w, height: h });
    await open(page, 'ep1', '有罪', 'zh');
    await expect(page.locator('.vbench')).toHaveAttribute('data-phase', 'hold');
    const m = await page.evaluate(() => {
      const f = document.querySelector('.vbench .cam-frame')!.getBoundingClientRect();
      const st = document
        .querySelector('.vbench .cam-stage[data-cam="bench"]')!
        .getBoundingClientRect();
      const s = st.width / 1920;
      return {
        s,
        left: (f.left - st.left) / s,
        right: (f.right - st.left) / s,
        top: f.top - st.top,
        bottom: st.bottom - f.bottom,
        inView: f.right <= innerWidth && f.left >= 0,
      };
    });
    // 原圖全高；框在螢幕裡。
    expect(Math.abs(m.top)).toBeLessThan(1);
    expect(Math.abs(m.bottom)).toBeLessThan(1);
    expect(m.inView).toBe(true);
    // 掛鐘直徑 ≥ 20 CSS px，整個在框裡。
    expect(CLOCK_W * 1920 * m.s).toBeGreaterThanOrEqual(20);
    expect(m.right).toBeGreaterThanOrEqual((0.9255 + CLOCK_W) * 1920);
    // 左緣在第二、三根燈座之間，兩邊都留空（兩根燈座之間原圖只有 16 px，見 PR 說明）。
    expect((m.left - TUBE2_END) * m.s).toBeGreaterThanOrEqual(2);
    expect((TUBE3_START - m.left) * m.s).toBeGreaterThanOrEqual(2);
    if (process.env.SHOTS)
      await page.screenshot({
        path: `/mnt/project-files/qa/court-ui/2026-11-06-verdict-bench/phone-${w}-verdict-e1-164845-zh.png`,
      });
  });
