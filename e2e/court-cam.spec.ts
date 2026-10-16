import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 鏡頭條在異議那一拍裡不動（設計師 #247 第一輪）：一刀黑、法官席、落章、證人回答都在鏡頭條裡剪，
 * 鏡頭條本身的 top 在窗開、按下理由之後的每個時間點都一樣。存檔停在柯瓦斯基主詰問開頭：
 * 第一題沒有該提的異議（提了就駁回），第二題是誘導（成立）。
 */
const save = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as { ep1: unknown };

async function tops(page: Page, ms: number) {
  const cam = page.locator('.court-cam.strip');
  const out: number[] = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    out.push(await cam.evaluate((e) => Math.round(e.getBoundingClientRect().top)));
    await page.waitForTimeout(80);
  }
  return out;
}

for (const [width, height] of [
  [1366, 768],
  [1440, 900],
  [1530, 860],
] as const)
  test(`鏡頭條在異議那一拍裡不動（${width}×${height}）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '鏡頭條只在桌機');
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (s) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('lawgame-ep-auto', s);
      },
      JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
    );
    await page.goto('/');
    await page
      .getByRole('button', { name: /^繼續（/ })
      .first()
      .click();
    const open = page.getByRole('button', { name: '開庭' });
    await open.or(page.locator('.court-cam.strip')).first().waitFor();
    if (await open.isVisible()) await open.click();
    const cam = page.locator('.court-cam.strip');
    await expect(cam).toBeVisible();
    const next = page.getByRole('button', { name: '聽下一個問題' });
    const reason = page.locator('section.objection .row button').first();
    const seen: number[] = await tops(page, 200);
    for (let round = 0; round < 2; round++) {
      await next.click();
      await expect(reason).toBeVisible();
      seen.push(...(await tops(page, 200)));
      await reason.click();
      // 一刀黑 → 法官席 → 落章 → 法官 → 切回證人 → 證人回答，到主按鈕回來為止。
      seen.push(...(await tops(page, 3600)));
      await expect(next).toBeVisible();
    }
    expect(new Set(seen).size, `top 出現過：${[...new Set(seen)].join(', ')}`).toBe(1);
  });

/** 異議理由按鈕兩列都是 44px：英文和中文同一個字級，最長的理由也只斷兩行（設計師 #247 第三輪）。 */
for (const lang of ['zh', 'en'] as const)
  for (const width of [1366, 1530, 1920] as const)
    test(`異議理由按鈕都是 44px 高（${lang}・${width}）`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', '只量桌機');
      await page.setViewportSize({
        width,
        height: width === 1366 ? 768 : width === 1530 ? 860 : 1080,
      });
      await page.addInitScript(
        ([s, lang]) => {
          if (sessionStorage.getItem('seeded')) return;
          sessionStorage.setItem('seeded', '1');
          localStorage.clear();
          localStorage.setItem('lawgame-ep-auto', s);
          if (lang === 'en') localStorage.setItem('lawgame-lang', 'en');
        },
        [
          JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
          lang,
        ] as const,
      );
      await page.goto('/');
      await page
        .getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ })
        .first()
        .click();
      const cam = page.locator('.court-cam.strip');
      const open = page.getByRole('button', { name: lang === 'en' ? /^Go to court/ : '開庭' });
      await open.or(cam).first().waitFor();
      if (await open.isVisible()) await open.click();
      await page
        .getByRole('button', { name: lang === 'en' ? 'Hear the next question' : '聽下一個問題' })
        .click();
      const buttons = page.locator('section.objection:not([data-off]) .row button');
      await expect(buttons).toHaveCount(8);
      const heights = await buttons.evaluateAll((bs) =>
        bs.map((b) => Math.round(b.getBoundingClientRect().height)),
      );
      expect(heights).toEqual(Array(8).fill(44));
    });

/**
 * 關卡 2（第 13 條）：主詰問結束後，手機英文底列的三顆按鈕都在畫面裡。
 */
test('主詰問結束：手機英文底列不溢出', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', '只量手機');
  await page.addInitScript(
    (s) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', s);
      localStorage.setItem('lawgame-lang', 'en');
      localStorage.setItem('lawgame-record-instant', '1');
    },
    JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^Continue/ })
    .first()
    .click();
  const open = page.getByRole('button', { name: /^Go to court/ });
  await open.or(page.locator('.record')).first().waitFor();
  if (await open.isVisible()) await open.click();
  const cross = page.getByRole('button', { name: 'Begin cross-examination' });
  for (let i = 0; i < 40 && !(await cross.isVisible()); i++) {
    const none = page.getByRole('button', { name: 'No objection' });
    if (await none.isVisible().catch(() => false)) {
      await none.click();
      continue;
    }
    await page
      .locator('button.primary.wide')
      .first()
      .click({ timeout: 2000 })
      .catch(() => {});
    await page.waitForTimeout(400);
  }
  await expect(cross).toBeVisible();
  const vw = page.viewportSize()!.width;
  const box = (await cross.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  const primary = (await page.locator('.shell-foot button.primary.wide').boundingBox())!;
  expect(primary.height).toBeLessThan(80);
});

/**
 * 關卡 2 第 14 條：陪審團面板在左下（設定集第 8 章 :87、第 10 章 :16），桌機 2×6、每張 56×70；
 * 交互詰問的工作欄因此不用讓出高度。1100 寬左欄放不下 376 寬，收成刻痕條（不縮小卡片）。
 */
for (const [width, height] of [
  [1530, 860],
  [1440, 900],
  [1100, 800],
] as const)
  test(`陪審團在左下、卡片不縮小（${width}×${height}）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', '只量桌機');
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (s) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('lawgame-ep-auto', s);
        localStorage.setItem('lawgame-record-instant', '1');
      },
      JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
    );
    await page.goto('/');
    await page
      .getByRole('button', { name: /^繼續（/ })
      .first()
      .click();
    const open = page.getByRole('button', { name: '開庭' });
    await open.or(page.locator('.record')).first().waitFor();
    if (await open.isVisible()) await open.click();
    const cross = page.getByRole('button', { name: '開始交互詰問' });
    for (let i = 0; i < 40 && !(await cross.isVisible()); i++) {
      const none = page.getByRole('button', { name: '不異議' });
      if (await none.isVisible().catch(() => false)) {
        await none.click();
        continue;
      }
      await page
        .locator('button.primary.wide')
        .first()
        .click({ timeout: 2000 })
        .catch(() => {});
      await page.waitForTimeout(400);
    }
    await cross.click();
    await page.waitForTimeout(800);
    const rec = (await page.locator('.record').boundingBox())!;
    const jury = page.locator('.jurybox');
    const jb = (await jury.boundingBox())!;
    // 陪審團在筆錄下面、同一欄。
    expect(jb.y).toBeGreaterThanOrEqual(rec.y + rec.height - 1);
    expect(Math.abs(jb.x - rec.x)).toBeLessThan(4);
    const body = await page
      .locator('.shell-body')
      .evaluate((e) => e.getBoundingClientRect().height);
    if (width >= 1180) {
      const face = (await page.locator('.jb-grid .jf-face').first().boundingBox())!;
      expect([Math.round(face.width), Math.round(face.height)]).toEqual([56, 70]);
      expect(body).toBeGreaterThanOrEqual(300);
    } else {
      await expect(jury).toHaveClass(/collapsed/);
      await jury.locator('.jb-strip').click();
      const face = (await page.locator('.jb-grid .jf-face').first().boundingBox())!;
      expect([Math.round(face.width), Math.round(face.height)]).toEqual([48, 60]);
    }
  });

/**
 * 關卡 2 v92 #A、#B：法官的裁定分成幾張字幕，每一張都要在法官席上出現、讀完才切回證人；
 * 一句一張、最多兩行、張數不隨寬度變；框頂在立牌上緣往下 40% 的下面（不壓頭）。
 * 法官席的裁切讓法官的眼睛落在畫面上三分之一（設定集 RD-ART-0406），字幕才不用躲頭。
 * 存檔停在柯瓦斯基主詰問開頭：第一題提異議會被駁回（兩句），第二題成立（兩句）。
 */
const RULINGS = {
  zh: [
    ['異議駁回。', '律師，這個問題沒有問題。'],
    ['異議成立。', '檢察官，請不要把答案放進問題裡。'],
  ],
  en: [
    ['Overruled.', 'There’s nothing wrong with that question, counsel.'],
    ['Sustained.', 'Counsel, don’t put the answer in the question.'],
  ],
} as const;

for (const lang of ['zh', 'en'] as const)
  for (const width of [1100, 1366, 1530, 0]) {
    test(`法官的裁定一句一張、都讀得到、不壓頭（${width || '手機'}・${lang}）`, async ({
      page,
    }, info) => {
      test.skip(
        (info.project.name === 'desktop') === (width === 0),
        width ? '鏡頭條只在桌機' : '手機插入鏡頭',
      );
      test.setTimeout(120_000);
      if (width) await page.setViewportSize({ width, height: 860 });
      await page.addInitScript(
        ([s, l]) => {
          if (sessionStorage.getItem('seeded')) return;
          sessionStorage.setItem('seeded', '1');
          localStorage.clear();
          localStorage.setItem('lawgame-ep-auto', s);
          if (l === 'en') localStorage.setItem('lawgame-lang', 'en');
        },
        [
          JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
          lang,
        ] as const,
      );
      await page.goto('/');
      await page
        .getByRole('button', { name: lang === 'en' ? /^Continue/ : /^繼續（/ })
        .first()
        .click();
      const open = page.getByRole('button', { name: lang === 'en' ? 'Go to court' : '開庭' });
      await open.or(page.locator('.court-cam')).first().waitFor();
      if (await open.isVisible()) await open.click();
      await expect(page.locator('.court-cam').first()).toBeVisible();
      await page.waitForTimeout(1500);
      const next = page.locator('button.primary.wide:not(.locked)').first();
      const rounds: string[][] = [];
      for (let round = 0; round < 2; round++) {
        await next.click();
        const reason = page.locator('section.objection .row button').first();
        await expect(reason).toBeVisible();
        await reason.click();
        const texts: string[] = [];
        const t0 = Date.now();
        let cut = false;
        while (Date.now() - t0 < 14000 && !cut) {
          const s = await page.evaluate(() => {
            const frame = document.querySelector('.cam-frame')!;
            const fr = frame.getBoundingClientRect();
            const shot = frame.getAttribute('data-shot') ?? '';
            const head = document.querySelector('.cam-stage[data-cam="bench"] .cam-standee')!;
            const hr = head.getBoundingClientRect();
            const subs = [...document.querySelectorAll('.cam-sub')]
              .filter(
                (e) =>
                  getComputedStyle(e).visibility !== 'hidden' &&
                  Number(getComputedStyle(e).opacity) > 0.9,
              )
              .map((e) => ({
                text: (e.querySelector('.tx') as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
                top: e.getBoundingClientRect().top - fr.top,
                lines: Math.round(
                  (e.querySelector('.tx') as HTMLElement).getBoundingClientRect().height /
                    parseFloat(getComputedStyle(e).lineHeight),
                ),
              }));
            return { shot, subs, headLimit: hr.top - fr.top + (hr.bottom - hr.top) * 0.4 };
          });
          if (s.shot === 'bench')
            for (const c of s.subs) {
              if (!c.text) continue;
              if (!texts.includes(c.text)) texts.push(c.text);
              expect(c.lines, `${c.text} 最多兩行`).toBeLessThanOrEqual(2);
              expect(
                c.top,
                `${width || '手機'}：「${c.text}」框頂壓到法官的頭`,
              ).toBeGreaterThanOrEqual(s.headLimit);
            }
          else if (texts.length && s.shot !== 'bench') cut = true;
          await page.waitForTimeout(40);
        }
        expect(cut, '法官席要切回證人').toBe(true);
        rounds.push(texts);
        await expect(next).toBeVisible({ timeout: 8000 });
      }
      // 每一場、每個寬度：每一句一張，都讀得到。
      expect(rounds.map((r) => r.map((t) => t.replace(/\s+/g, ' ')))).toEqual(
        RULINGS[lang].map((r) => [...r]),
      );
    });
  }
