import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { proseUnits } from '../src/ui/lineUnits';

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
 * 關卡 2 v92 #A、#B（設計師 #290 第三輪）：法官的裁定分成幾張字幕，每一張都要在法官席上出現、讀完才切回證人；
 * 一句一張、最多兩行、不出單字卡、中文不斷在詞中間；字幕框不蓋燈管與牆上的鐘。
 * 法官席鏡頭 1.0×，裁切框盡量往下，但五支耐心燈管與鐘整個在畫面裡（燈管頂離畫面上緣 ≥4px）。
 * 框壓到法官的頭：設計師裁定可接受（量測見 qa/court-ui/2026-10-16-gate2-fixes/round3/README.md），不再斷言。
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

const benchCam = JSON.parse(
  readFileSync(new URL('../src/ui/court/cam/bench.json', import.meta.url), 'utf8'),
) as {
  crop239: number[];
  inView: Record<'tubes' | 'clock', number[]>;
};

for (const lang of ['zh', 'en'] as const)
  for (const [width, scale] of [
    [1100, 1],
    [1366, 1],
    [1530, 1],
    [0, 1],
    [1100, 1.5],
    [0, 1.5],
  ] as const) {
    test(`法官的裁定一句一張、都讀得到、燈管與鐘在畫面內（${width || '手機'}・${scale * 100}%・${lang}）`, async ({
      page,
    }, info) => {
      test.skip(
        (info.project.name === 'desktop') === (width === 0),
        width ? '鏡頭條只在桌機' : '手機插入鏡頭',
      );
      test.setTimeout(120_000);
      if (width) await page.setViewportSize({ width, height: 860 });
      await page.addInitScript(
        ([s, l, sc]) => {
          if (sessionStorage.getItem('seeded')) return;
          sessionStorage.setItem('seeded', '1');
          localStorage.clear();
          localStorage.setItem('lawgame-ep-auto', s);
          if (l === 'en') localStorage.setItem('lawgame-lang', 'en');
          if (sc !== 1)
            localStorage.setItem(
              'lawgame-settings',
              JSON.stringify({ state: { voScale: sc, voAuto: false, voBox: false }, version: 1 }),
            );
        },
        [
          JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress: save.ep1 }),
          lang,
          scale,
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
        let checkedView = false;
        while (Date.now() - t0 < 14000 && !cut) {
          const s = await page.evaluate(
            ([crop, view]) => {
              const frame = document.querySelector('.cam-frame')!;
              const fr = frame.getBoundingClientRect();
              const shot = frame.getAttribute('data-shot') ?? '';
              // 底圖在框裡的位置：整張圖寬 = 框寬 / 裁切寬，往上、往左推裁切框的起點。
              const insert = !!document.querySelector('.court-cam.insert');
              const c = insert ? [0, 0, 1, 1] : crop;
              const pw = fr.width / c[2];
              const ph = pw * (9 / 16);
              const rectOf = (r: number[]) => ({
                left: pw * (r[0] - c[0]),
                top: ph * (r[1] - c[1]),
                right: pw * (r[0] + r[2] - c[0]),
                bottom: ph * (r[1] + r[3] - c[1]),
              });
              const subs = [...document.querySelectorAll('.cam-sub')]
                .filter(
                  (e) =>
                    getComputedStyle(e).visibility !== 'hidden' &&
                    Number(getComputedStyle(e).opacity) > 0.9,
                )
                .map((e) => {
                  const tx = e.querySelector('.tx') as HTMLElement;
                  // 每個字的位置分行：看每一行是從哪個字開始的。
                  const lineStarts: number[] = [];
                  const walker = document.createTreeWalker(tx, NodeFilter.SHOW_TEXT);
                  let off = 0;
                  let lastTop = -1;
                  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                    const t = (n as Text).data;
                    for (let i = 0; i < t.length; i++) {
                      if (/\s/.test(t[i])) {
                        off++;
                        continue;
                      }
                      const r = document.createRange();
                      r.setStart(n, i);
                      r.setEnd(n, i + 1);
                      const top = Math.round(r.getBoundingClientRect().top);
                      if (lastTop < 0 || Math.abs(top - lastTop) > 6) lineStarts.push(off);
                      lastTop = top;
                      off++;
                    }
                  }
                  const b = e.getBoundingClientRect();
                  return {
                    text: tx.innerText.replace(/\s+/g, ' ').trim(),
                    flat: tx.textContent!.replace(/\s+/g, ''),
                    lineStarts,
                    box: {
                      left: b.left - fr.left,
                      top: b.top - fr.top,
                      right: b.right - fr.left,
                      bottom: b.bottom - fr.top,
                    },
                    lines: lineStarts.length,
                  };
                });
              return {
                shot,
                subs,
                frame: { w: fr.width, h: fr.height },
                tubes: rectOf(view.tubes),
                clock: rectOf(view.clock),
              };
            },
            [benchCam.crop239, benchCam.inView] as const,
          );
          if (s.shot === 'bench') {
            if (!checkedView) {
              checkedView = true;
              // 燈管（含發光）與鐘整個在畫面裡，燈管頂離上緣 ≥4px。
              if (width) {
                expect(s.tubes.top, `${width}：燈管頂離上緣`).toBeGreaterThanOrEqual(4 - 0.5);
                expect(s.tubes.left).toBeGreaterThanOrEqual(0);
                expect(s.tubes.right).toBeLessThanOrEqual(s.frame.w + 0.5);
                expect(s.tubes.bottom).toBeLessThanOrEqual(s.frame.h);
                expect(s.clock.left).toBeGreaterThanOrEqual(0);
                expect(s.clock.right).toBeLessThanOrEqual(s.frame.w + 0.5);
                expect(s.clock.top).toBeGreaterThanOrEqual(0);
                expect(s.clock.bottom).toBeLessThanOrEqual(s.frame.h);
              }
            }
            for (const c of s.subs) {
              if (!c.text) continue;
              if (!texts.includes(c.text)) texts.push(c.text);
              const tag = `${width || '手機'}・${scale * 100}%：「${c.text}」`;
              expect(c.lines, `${tag} 最多兩行`).toBeLessThanOrEqual(2);
              // 單字卡：沒收尾的一個字（「Counsel,」）。
              const words = lang === 'en' ? c.text.split(' ').length : c.flat.length;
              if (!/[。！？.!?」”’)）]$/.test(c.text))
                expect(words, `${tag} 單字卡`).toBeGreaterThanOrEqual(lang === 'en' ? 2 : 3);
              // 中文不斷在詞中間：換行的位置要是換行單位的邊界。
              if (lang === 'zh' && c.lineStarts.length > 1) {
                const marks = new Set<number>();
                let pos = 0;
                for (const u of proseUnits(c.flat, false)) marks.add((pos += u.length));
                for (const at of c.lineStarts.slice(1))
                  expect(marks.has(at), `${tag} 斷在詞中間（第 ${at} 字前）`).toBe(true);
              }
              // 字幕框不蓋燈管與鐘。
              if (width)
                for (const [name, r] of [
                  ['燈管', s.tubes],
                  ['鐘', s.clock],
                ] as const)
                  expect(
                    c.box.top >= r.bottom ||
                      c.box.bottom <= r.top ||
                      c.box.left >= r.right ||
                      c.box.right <= r.left,
                    `${tag} 蓋到${name}`,
                  ).toBe(true);
            }
          } else if (texts.length && s.shot !== 'bench') cut = true;
          await page.waitForTimeout(40);
        }
        expect(cut, '法官席要切回證人').toBe(true);
        rounds.push(texts);
        await expect(next).toBeVisible({ timeout: 8000 });
      }
      // 每一句都讀得到：100% 一句一張；150% 一句放不下兩行時在片語邊界切成幾張，合起來是原句。
      const squash = (t: string) => t.replace(/\s+/g, '');
      expect(rounds.map((r) => squash(r.join('')))).toEqual(
        RULINGS[lang].map((r) => squash(r.join(''))),
      );
      // 100% 且鏡頭條夠寬：一句一張。
      if (scale === 1 && width !== 1100)
        expect(rounds.map((r) => r.length)).toEqual(RULINGS[lang].map((r) => r.length));
    });
  }
