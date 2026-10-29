/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { parse } from 'yaml';
import { brightest } from './png';

/**
 * 場景底圖接進畫面（scenePlate.tsx）：定場那一格就是底圖（場記疊在上面）、之後的對話場景拿它當背景。
 * 擋：圖跟場景（中英兩張）、色溫讀燈組、手機用手機版、等圖時整格純黑（場記、占位字都不出）、
 * 介面不壓在圖的上半部。
 */
const rigs = parse(
  readFileSync(new URL('../src/content/rigs.yaml', import.meta.url), 'utf8'),
) as Record<string, { kelvin: number }>;

type Case = {
  name: string;
  scene: number;
  rig: string;
  deal?: string;
  plate: Record<string, string>;
};
const CASES: Case[] = [
  { name: '會議室夜', scene: 13, rig: 'ep1-conf-a-sun-night', plate: { zh: 's1-an', en: 's1-an' } },
  {
    name: '法院台階',
    scene: 33,
    rig: 'ep1-court-steps-mon',
    deal: 'o-probation',
    plate: { zh: 's6-steps', en: 's6-steps-en' },
  },
  {
    name: '羈押室門口',
    scene: 32,
    rig: 'ep1-holding-door-mon',
    deal: 'o-murder2',
    plate: { zh: 'holding-door-zh', en: 'holding-door' },
  },
];

async function open(page: Page, scene: number, lang: 'zh' | 'en', deal?: string, scale = 1) {
  await page.goto('/');
  await page.evaluate(
    ([scene, lang, deal, scale]) => {
      localStorage.setItem('lawgame-lang', lang as string);
      localStorage.setItem(
        'lawgame-settings',
        JSON.stringify({ state: { voScale: scale }, version: 1 }),
      );
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep1',
            scene,
            step: 0,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: deal ? { 'plea-morrow': { outcome: 'deal', deal: 'x', dealId: deal } } : {},
          },
        }),
      );
    },
    [scene, lang, deal, scale] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
}

/** 一張一張翻字幕，翻到畫外字幕（盧卡斯沒說出口的那句）出現。 */
async function toVoiceOver(page: Page) {
  for (let i = 0; i < 12 && !(await page.locator('.vo').count()); i++)
    await page.locator('.scene.plated .primary').click();
}

for (const lang of ['zh', 'en'] as const)
  for (const c of CASES) {
    test(`${c.name}（${lang}）：定場是底圖，色溫讀燈組，手機用手機版`, async ({ page }, info) => {
      await open(page, c.scene, lang, c.deal);
      const plate = page.locator('.plate-host .scene-plate');
      await expect(plate).toHaveAttribute('data-plate', c.plate[lang]);
      await expect(plate).toHaveAttribute('data-rig', c.rig);
      await expect(plate).toHaveAttribute('data-kelvin', String(rigs[c.rig].kelvin));
      await expect(plate).toHaveAttribute('data-state', 'ok');
      const phone = info.project.name === 'chromium';
      const img = plate.locator('.plate-bg');
      await expect(img).toHaveAttribute('src', phone ? /phone/ : /desktop/);
      expect(await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(
        true,
      );
      // 整張鋪滿視窗；場記疊在圖上，占位字拿掉。
      const [box, view] = await Promise.all([
        plate.boundingBox(),
        page.evaluate(() => [innerWidth, innerHeight]),
      ]);
      expect([box!.width, box!.height]).toEqual(view);
      await expect(page.locator('.place-slate')).toBeVisible();
      await expect(page.locator('.place-slate')).toContainText(`${rigs[c.rig].kelvin}K`);
      await expect(page.locator('.place-tbd')).toHaveCount(0);

      // 切進那一場：台詞框貼底，圖的上半部沒有任何介面壓著，圖同一張。
      await page.locator('.place-beat').click();
      // 底圖是共用一層，換場前後同一個節點：先等這一場的介面掛上來，再量。
      await expect(page.locator('.scene.plated')).toBeVisible();
      const bg = page.locator('.plate-host .scene-plate');
      await expect(bg).toHaveAttribute('data-plate', c.plate[lang]);
      await expect(bg).toHaveAttribute('data-state', 'ok');
      const [w, h] = view;
      const top = await page.evaluate(
        ([w, h]) => {
          // 底圖不吃指標事件，點得到的是它前面的東西：只要不是台詞框、按鈕、眉標、選單，就是空的、看得見圖。
          const hit = (fx: number, fy: number) =>
            !document
              .elementFromPoint(w * fx, h * fy)
              ?.closest('.lines, .sub-card, .sub-actions, button, .eyebrow, dialog');
          // 對話是字幕（最新一句）；理論開場那一頁還是台詞框。
          const lines = (document.querySelector('.scene.plated > .sub-card') ??
            document.querySelector('.scene.plated > .lines'))!.getBoundingClientRect();
          return {
            open: [0.15, 0.5, 0.85].every((fx) => [0.2, 0.3, 0.4].every((fy) => hit(fx, fy))),
            linesTop: lines.top / h,
          };
        },
        [w, h],
      );
      expect(top.open).toBe(true);
      expect(top.linesTop).toBeGreaterThan(0.5);
      await expect(
        page.locator('.scene.plated > .sub-card, .scene.plated > .lines:not([data-closed])'),
      ).toBeVisible();
      await expect(page.locator('.scene.plated .primary')).toBeVisible();
    });
  }

for (const lang of ['zh', 'en'] as const)
  test(`等底圖的時候整格純黑：沒有場記、沒有占位字，圖到了才開始（${lang}）`, async ({ page }) => {
    await page.route(/\/assets\/(s1-an|s6-steps|holding-door)[^/]*\.jpg/, async (r) => {
      await new Promise((x) => setTimeout(x, 3500));
      await r.continue();
    });
    await open(page, 33, lang, 'o-probation');
    const beat = page.locator('.place-beat');
    await expect(beat).toHaveClass(/waiting/);
    const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
    // 選單鈕在右上角，是玩家的手；左邊六成整格量。
    const clip = { x: 0, y: 0, width: Math.round(w * 0.6), height: h };
    // 進鏡頭層的 200ms 淺色→深色漸變跑完再量（act-stage::before）。
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running'),
    );
    const still = () => beat.evaluate((e) => e.classList.contains('waiting'));
    const t0 = Date.now();
    const maxes: number[] = [];
    while (Date.now() - t0 < 1200) {
      await expect(page.locator('.place-slate')).toHaveCount(0);
      await expect(page.locator('.place-tbd')).toHaveCount(0);
      // 截圖前後都還在等，這一張才算數（機器忙的時候圖可能剛好到）。
      const before = await still();
      const shot = await page.screenshot({ clip });
      if (before && (await still())) maxes.push(brightest(shot));
      await page.waitForTimeout(150);
    }
    expect(maxes.length).toBeGreaterThan(2);
    expect(Math.max(...maxes)).toBeLessThanOrEqual(3);
    // 圖到了：等待結束，場記出現，圖亮著。
    await expect(beat).not.toHaveClass(/waiting/, { timeout: 5000 });
    await expect(page.locator('.plate-host .scene-plate')).toHaveAttribute('data-state', 'ok');
    await expect(page.locator('.place-slate')).toBeVisible();
    expect(brightest(await page.screenshot({ clip }))).toBeGreaterThan(40);
  });

test('等圖的時候點一下可以跳過；進了場景，圖到之前也是純黑', async ({ page }) => {
  await page.route(/\/assets\/s6-steps[^/]*\.jpg/, async (r) => {
    await new Promise((x) => setTimeout(x, 1500));
    await r.continue();
  });
  await open(page, 33, 'zh', 'o-probation');
  await expect(page.locator('.place-beat')).toHaveClass(/waiting/);
  await page.locator('.place-beat').click();
  const bg = page.locator('.plate-host .scene-plate');
  await expect(page.locator('.scene.dialogue')).toBeVisible();
  await expect(bg).toBeVisible();
  const color = await bg.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(color).toBe('rgb(0, 0, 0)');
  await expect(bg).toHaveAttribute('data-state', 'ok', { timeout: 5000 });
});

test('沒有底圖的場景照舊：定場放占位字，對話不貼底', async ({ page }) => {
  await open(page, 12, 'zh');
  await expect(page.locator('.plate-host .scene-plate')).toHaveCount(0);
  await expect(page.locator('.place-tbd')).toContainText('待放 3D 機位');
  await page.locator('.place-beat').click();
  await expect(page.locator('.scene.dialogue')).toBeVisible();
  await expect(page.locator('.scene-plate')).toHaveCount(0);
  await expect(page.locator('.scene.plated')).toHaveCount(0);
});

test('案件理論：開場那一頁有底圖；選理論那一頁留著同一張，壓暗 58%，卡片照舊', async ({ page }) => {
  await open(page, 13, 'zh');
  await page.locator('.place-beat').click();
  await expect(page.locator('.plate-host .scene-plate')).toHaveAttribute('data-plate', 's1-an');
  // 開場頁是字幕模式：一張卡一句，翻到最後一張，按鈕才是「選擇案件理論」。
  const next = page.locator('.scene.plated .primary');
  for (
    let i = 0;
    i < 12 && !(await page.getByRole('button', { name: /選擇案件理論/ }).count());
    i++
  )
    await next.click();
  await page.getByRole('button', { name: /選擇案件理論/ }).click();
  await expect(page.locator('.theory-card').first()).toBeVisible();
  const bg = page.locator('.scene-plate');
  await expect(bg).toHaveCount(1);
  await expect(bg).toHaveAttribute('data-plate', 's1-an');
  await expect(bg).toHaveAttribute('data-state', 'ok');
  await expect(bg).toHaveAttribute('data-dim', '');
  const veil = await bg.evaluate((e) => getComputedStyle(e, '::after').backgroundColor);
  expect(veil).toBe('rgba(6, 8, 11, 0.58)');
  // 說明字不是場記：不放黑條，直接寫在壓暗的房間上（只有眉標是黑條）。
  const hint = page.locator('.scene.backdrop > .muted');
  const hs = await hint.evaluate((e) => {
    const c = getComputedStyle(e);
    return { bg: c.backgroundColor, size: c.fontSize, shadow: c.textShadow };
  });
  expect(hs.bg).toBe('rgba(0, 0, 0, 0)');
  expect(hs.size).toBe((page.viewportSize()?.width ?? 0) < 768 ? '13px' : '14px');
  expect(hs.shadow).not.toBe('none');
});

test('底圖上的字幕模式：只留最新一句，筆錄抽屜才有前面的台詞；框半透明加模糊、上緣不淡出；沒有盧卡斯大圖；眉標一行', async ({
  page,
}) => {
  await open(page, 33, 'zh', 'o-probation');
  await page.locator('.place-beat').click();
  const card = page.locator('.scene.plated > .sub-card');
  await expect(card).toBeVisible();
  // 第一句：旁白，不掛名字；筆錄收著，前面的台詞不在畫面上。
  await expect(card).toContainText('伊森的姊姊在等他');
  await expect(card.locator('.who')).toHaveCount(0);
  await expect(page.locator('.scene.plated > .transcript')).toBeHidden();
  const cs = await card.evaluate((e) => {
    const c = getComputedStyle(e);
    return { blur: c.backdropFilter, bg: c.backgroundColor };
  });
  expect(cs.blur).toContain('blur(8px)');
  expect(cs.bg).toMatch(/rgba\(.*0\.\d+\)/);
  // 下三分之一、最多兩行（這一場的句子都夠短）。
  const box = (await card.boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(box.y).toBeGreaterThan(vh * 0.6);
  const lh = await card.locator('.tx').evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
  expect((await card.locator('.tx').boundingBox())!.height).toBeLessThanOrEqual(lh * 2 + 1);
  // 字幕要兩行長度相近（balance）：court.css 的內文通則是 pretty，字幕卡自己的規則要壓過它（旁白和對白都是）。
  const wrapOf = (l: Locator) =>
    l.evaluate((e) => getComputedStyle(e).getPropertyValue('text-wrap-style'));
  expect(await wrapOf(card)).toBe('balance');
  expect(await wrapOf(card.locator('.tx'))).toBe('balance');
  // 一張卡一句：旁白兩句是兩張，「繼續」先翻卡，不跳到下一個人。
  await expect(card).not.toContainText('他走到一半停下來');
  await page.locator('.scene.plated .primary').click();
  await expect(card).toContainText('他走到一半停下來');
  await expect(card).not.toContainText('伊森的姊姊在等他');
  // 下一個人：說話者的名字在上（亮字，不用黃），上一句不在畫面上。
  await page.locator('.scene.plated .primary').click();
  await expect(card).toContainText('謝謝你');
  await expect(card).not.toContainText('伊森的姊姊在等他');
  const who = card.locator('.who');
  await expect(who).toHaveText('伊森・蕭');
  expect(await wrapOf(card)).toBe('balance');
  expect(await wrapOf(card.locator('.tx'))).toBe('balance');
  expect(await who.evaluate((e) => getComputedStyle(e).color)).not.toMatch(
    /^rgb\(2[0-9]{2}, 1[5-9]/,
  );
  // 筆錄抽屜：打開以後字幕讓位（同一句不出現兩次），前面的台詞都在；半透明加模糊、上緣不淡出。
  const rec = page.getByRole('button', { name: '筆錄' });
  await rec.click();
  await expect(card).toHaveCount(0);
  const log = page.locator('.scene.plated > .transcript');
  await expect(log).toBeVisible();
  await expect(log).toContainText('伊森的姊姊在等他');
  await expect(log).toContainText('謝謝你');
  // 筆錄裡的台詞是內文，照 court.css 的通則 pretty（只有字幕卡是 balance）。
  expect(await wrapOf(log.locator('.speech').first())).toBe('pretty');
  const st = await log.evaluate((e) => {
    const c = getComputedStyle(e);
    return { blur: c.backdropFilter, mask: c.maskImage, bg: c.backgroundColor };
  });
  expect(st.blur).toContain('blur(8px)');
  expect(st.mask).toBe('none');
  expect(st.bg).toMatch(/rgba\(.*0\.\d+\)/);
  await expect(page.getByRole('button', { name: '收起筆錄' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('button', { name: '收起筆錄' }).click();
  await expect(log).toBeHidden();
  await expect(card).toBeVisible();
  // 沒有盧卡斯大圖；眉標一行。
  await expect(page.locator('.lucas-stage')).toHaveCount(0);
  const eyebrow = page.locator('.plate-eyebrow');
  const eb = await eyebrow.boundingBox();
  const elh = await eyebrow.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
  expect(eb!.height).toBeLessThan(elh * 2);
});

// 字幕卡（設計師 #296）：桌機 20px、手機 17px（乘設定的 1／1.25／1.5），行高 1.5，旁白一樣大；
// 一張卡一句、翻完一個人的話才換人，任何一張都不超過兩行、不超出視窗。
/** 設計師 #296 第二版的斷點表（最窄手機 360、字幕 150%、英文，無襯線 500 的實測字寬）：每一張卡的內容。 */
const BREAKS_150: Record<string, string[]> = {
  會議室夜: [
    'And it has to stand',
    "on the arguments you've actually got.",
    'Change the story halfway',
    'and all they remember is that you changed it.',
  ],
  法院台階: [
    'On the courthouse steps,',
    "Ethan's sister is waiting for him.",
    'Halfway down he stops',
    'and looks back at Lucas.',
  ],
  羈押室門口: [
    'The side door of the sentencing courtroom',
    'leads to the holding cells.',
    'At the door the bailiff pauses long enough',
    'for Ethan to look back.',
    'His hands are cuffed in front of him;',
    "he can't offer one.",
  ],
};

for (const lang of ['zh', 'en'] as const)
  for (const scale of [1, 1.25, 1.5])
    for (const c of CASES)
      for (const narrow of [false, true])
        test(`字幕卡一句一張、不超過兩行：${c.name}（${lang}）${scale * 100}%${narrow ? ' 最窄手機 360' : ''}`, async ({
          page,
        }, info) => {
          // 手機另外在最窄的 360 寬再跑一次（預設的是 412）。
          test.skip(narrow && info.project.name !== 'chromium', '只有手機專案');
          if (narrow) await page.setViewportSize({ width: 360, height: 800 });
          await open(page, c.scene, lang, c.deal, scale);
          await page.locator('.place-beat').click();
          const card = page.locator('.scene.plated > .sub-card');
          await expect(card).toBeVisible();
          const phone = info.project.name === 'chromium';
          const px = (phone ? 17 : 20) * scale;
          const view = page.viewportSize()!;
          const seen: string[] = [];
          for (let i = 0; i < 16 && (await card.count()); i++) {
            const tx = card.locator('.tx');
            const text = await tx.innerText();
            seen.push(text);
            const m = await card.evaluate((e) => {
              const x = e.querySelector('.tx')!;
              const cs = getComputedStyle(x);
              const r = e.getBoundingClientRect();
              const rows = new Set([...x.getClientRects()].map((q) => Math.round(q.top)));
              return {
                of: e.getAttribute('data-of'),
                marked: e.hasAttribute('data-marked'),
                weight: cs.fontWeight,
                family: cs.fontFamily,
                size: cs.fontSize,
                lh: parseFloat(cs.lineHeight),
                h: x.getBoundingClientRect().height,
                left: r.left,
                right: r.right,
                rows: rows.size,
              };
            });
            // 英文的句子只要在這個寬度、字級斷成多張，就要是手標的斷點（plateBreaks.ts），不准程式猜。
            if (lang === 'en' && m.of) expect(m.marked, `沒標斷點：${text}`).toBe(true);
            // 設定集 10.1：字幕是無襯線 500（旁白也一樣，不用明體）。
            expect(m.weight, text).toBe('500');
            expect(m.family, text).toMatch(/^"?(Noto Sans TC|IBM Plex Sans)/);
            expect(m.family, text).not.toMatch(/Serif|Songti|PMingLiU/);
            expect(m.size, text).toBe(`${px}px`);
            expect(m.lh, text).toBeCloseTo(px * 1.5, 1);
            expect(m.h, text).toBeLessThanOrEqual(m.lh * 2 + 1);
            expect(m.left).toBeGreaterThanOrEqual(0);
            expect(m.right).toBeLessThanOrEqual(view.width);
            // 一張只有一個句子（句尾標點後面不再接字）。
            expect(text, '一張卡兩個句子').not.toMatch(/[。！？.!?][」』”’"]?\s*\S/);
            await page.locator('.scene.plated .primary').click();
            await expect
              .poll(async () => ((await card.count()) ? await tx.innerText() : null))
              .not.toBe(text);
          }
          // 每個場景至少一張，而且翻到頭（對話走完才換下一個畫面）。
          expect(seen.length).toBeGreaterThanOrEqual(3);
          expect(seen.length).toBeLessThan(16);
          // 最窄手機＋150% 的英文：照設計師的斷點表斷（plateBreaks.ts），卡裡的換行也是表上的位置。
          if (narrow && scale === 1.5 && lang === 'en') {
            const flat = seen.map((x) => x.replace(/\s+/g, ' ').replace(/[’‘]/g, "'").trim());
            for (const want of BREAKS_150[c.name]) expect(flat, want).toContain(want);
          }
        });

test('底圖上的畫外字幕：走鏡頭層，只壓暗圖、不用紙色蓋掉；滑鼠靠近也不變色', async ({ page }) => {
  await open(page, 33, 'zh', 'o-probation');
  await page.locator('.place-beat').click();
  // 最後一句（盧卡斯的畫外字幕）
  await toVoiceOver(page);
  const vo = page.locator('.vo');
  await expect(vo).toHaveAttribute('data-layer', 'scene');
  const hit = vo.locator('.vo-hit');
  await hit.hover({ position: { x: 20, y: 200 } });
  const [veil, hitBg] = await Promise.all([
    vo.locator('.vo-veil').evaluate((e) => getComputedStyle(e).backgroundColor),
    hit.evaluate((e) => getComputedStyle(e).backgroundColor),
  ]);
  expect(veil).toBe('rgba(6, 8, 11, 0.58)');
  expect(hitBg).toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('.plate-host .scene-plate')).toHaveAttribute('data-state', 'ok');
  // 縫的光不跟主題（淺色主題也是鏡頭層）；字幕開著的時候這一句還沒進筆錄；提示屬於字幕，在進度細線下面。
  expect(await vo.evaluate((e) => getComputedStyle(e).colorScheme)).toBe('dark');
  await expect(page.locator('.scene.plated .vo-log')).toHaveCount(0);
  await expect(vo.locator('.vo-frame > .vo-cue')).toHaveCount(1);
  const [prog, cue] = await Promise.all([
    vo.locator('.vo-progress').boundingBox(),
    vo.locator('.vo-cue').boundingBox(),
  ]);
  expect(cue!.y).toBeGreaterThanOrEqual(prog!.y + prog!.height);
  // 縫的光不跟主題：light-dark() 權杖在 :root 已經解成淺色那邊，要在 .vo 上重宣告（亮、暗主題一樣是暖色記號）。
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    const mark = await vo.locator('.vo-mark').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(mark).not.toBe('rgb(93, 104, 119)');
    expect(mark).toMatch(/^color\(srgb 1 0\.88/);
  }
  // 這三張底圖字幕帶都夠暗，不加襯底。
  await expect(vo).not.toHaveAttribute('data-scrim', 'on');
});

// 一張全白的 64×36 JPEG：字幕帶太亮的情況。
const WHITE_JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3qiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP//Z',
  'base64',
);
test('底圖在字幕帶太亮：畫外字幕加自適應襯底（art bible 10.1）', async ({ page }) => {
  await page.route(/\/assets\/s6-steps[^/]*\.jpg/, (r) =>
    r.fulfill({ status: 200, contentType: 'image/jpeg', body: WHITE_JPG }),
  );
  await open(page, 33, 'zh', 'o-probation');
  await page.locator('.place-beat').click();
  await toVoiceOver(page);
  const vo = page.locator('.vo');
  await expect(vo).toHaveAttribute('data-layer', 'scene');
  await expect(vo).toHaveAttribute('data-scrim', 'on');
  const scrim = await vo
    .locator('.vo-frame')
    .evaluate((e) => getComputedStyle(e, '::after').backgroundImage);
  expect(scrim).toContain('radial-gradient');
});

test('手機的英文眉標拿掉前段後，剩下的首字大寫', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, '只有手機會拿掉前段');
  await open(page, 33, 'en', 'o-probation');
  await page.locator('.place-beat').click();
  const eyebrow = page.locator('.plate-eyebrow');
  await expect(eyebrow).toHaveClass(/short/);
  const room = (await eyebrow.locator('.ps-room').innerText()).trim();
  expect(room.charAt(0)).toBe(room.charAt(0).toUpperCase());
});

// 人物立牌：剪影站在底圖上（standees.json），位置是圖上的百分比，不管視窗多大都落在原有的接觸影子上。
const STANDEES = JSON.parse(
  readFileSync(new URL('../src/ui/plates/standees.json', import.meta.url), 'utf8'),
) as {
  sets: Record<
    string,
    {
      plates: string[];
      size: Record<'desktop' | 'phone', [number, number]>;
      anchor: Record<'desktop' | 'phone', { at: number; to: number }>;
      people: {
        id: string;
        desktop: { box: number[]; ink: number[]; head: number[] };
        phone: { box: number[]; ink: number[]; head: number[] };
      }[];
    }
  >;
};

for (const lang of ['zh', 'en'] as const)
  for (const c of CASES.filter((x) => x.deal)) {
    test(`${c.name}：立牌站在底圖上，位置跟著圖走（${lang}）`, async ({ page }) => {
      await open(page, c.scene, lang, c.deal);
      await page.locator('.place-beat').click();
      const bg = page.locator('.plate-host .scene-plate');
      await expect(bg).toHaveAttribute('data-state', 'ok');
      const set = Object.values(STANDEES.sets).find((x) => x.plates.includes(c.plate[lang]))!;
      const phone = (page.viewportSize()?.width ?? 0) < 768;
      const variant = phone ? 'phone' : 'desktop';
      const [pw, ph] = set.size[variant];
      const got = await page.evaluate(() => {
        const rect = (e: Element) => {
          const r = e.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        };
        const bgImg = document.querySelector<HTMLImageElement>('.plate-host .plate-bg')!;
        return {
          vw: innerWidth,
          vh: innerHeight,
          stage: rect(document.querySelector('.plate-host .plate-stage')!),
          natural: [bgImg.naturalWidth, bgImg.naturalHeight],
          people: Object.fromEntries(
            [...document.querySelectorAll('.plate-host .standee')].map((e) => [
              (e as HTMLElement).dataset.standee,
              { box: rect(e), loaded: (e as HTMLImageElement).complete },
            ]),
          ),
        };
      });
      // 圖本身就是底圖那個尺寸，舞台照 cover 鋪滿（兩邊至少一邊剛好貼齊）。
      expect(got.natural).toEqual([pw, ph]);
      const [sx, sy, sw, sh] = got.stage;
      expect(sw / sh).toBeCloseTo(pw / ph, 2);
      expect(sx).toBeLessThanOrEqual(0.5);
      expect(sy).toBeLessThanOrEqual(0.5);
      expect(sx + sw).toBeGreaterThanOrEqual(got.vw - 0.5);
      expect(sy + sh).toBeGreaterThanOrEqual(got.vh - 0.5);
      expect(Math.min(sw - got.vw, sh - got.vh)).toBeLessThanOrEqual(1);
      // 每個人都在，位置 = 圖上像素換成舞台上的位置。
      expect(Object.keys(got.people).sort()).toEqual(set.people.map((p) => p.id).sort());
      for (const p of set.people) {
        const [bx, by, bw, bh] = p[variant].box;
        const [x, y, w, h] = got.people[p.id].box;
        expect(got.people[p.id].loaded).toBe(true);
        expect(x).toBeCloseTo(sx + (bx / pw) * sw, 0);
        expect(y).toBeCloseTo(sy + (by / ph) * sh, 0);
        expect(w).toBeCloseTo((bw / pw) * sw, 0);
        expect(h).toBeCloseTo((bh / ph) * sh, 0);
        // 人不能被視窗切掉。S6 的手機裁切左右各留 12%（含 PNG 邊上 12 px 的透明邊），整個框都要在視窗裡；
        // 羈押室的手機裁切三個人佔 85% 寬（還沒留邊距），較窄的手機（直立 9:16 以外）會切到法警／盧卡斯的邊，
        // 這裡先只要求人的中線在視窗裡，邊距等場景光影重裁。
        const mid = x + w / 2;
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(got.vw);
        if (c.name === '法院台階') {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x + w).toBeLessThanOrEqual(got.vw);
        }
      }
      // 人不吃指標、不給讀屏，也不帶任何標籤字。
      await expect(page.locator('.standee').first()).toHaveCSS('pointer-events', 'none');
      await expect(page.locator('.scene-plate')).toHaveAttribute('aria-hidden', 'true');
      expect(await page.locator('.scene-plate').innerText()).toBe('');
    });
  }

test('沒有立牌的底圖（會議室夜）不放人', async ({ page }) => {
  await open(page, 13, 'zh');
  await page.locator('.place-beat').click();
  await expect(page.locator('.plate-host .scene-plate')).toHaveAttribute('data-state', 'ok');
  await expect(page.locator('.standee')).toHaveCount(0);
});

// 手機的水平裁切（standees.json 的 anchor）：
// 1. S6：以人群中心對齊視窗，三個人的外框離左右邊緣都至少 2%。
// 2. 羈押室：三個人佔圖寬 85%，360 寬的手機只看得到 80%，放不下；優先順序是每個人的頭完整入鏡且離邊至少 2%，
//    遠景的伊森、法警身體也完整入鏡，只有前景的盧卡斯身體可以被左緣切到（法警右緣離右邊 2%，不夠的寬度全從盧卡斯那側扣）。
for (const view of [
  { width: 360, height: 800 },
  { width: 412, height: 839 },
  { width: 390, height: 844 },
] as const)
  for (const c of CASES.filter((x) => x.deal)) {
    test(`${c.name}：手機 ${view.width}×${view.height}，人群的裁切`, async ({ page }) => {
      test.skip((page.viewportSize()?.width ?? 0) >= 768, '只有手機');
      await page.setViewportSize(view);
      await open(page, c.scene, 'zh', c.deal);
      await page.locator('.place-beat').click();
      await expect(page.locator('.plate-host .scene-plate')).toHaveAttribute('data-state', 'ok');
      const set = Object.values(STANDEES.sets).find((x) => x.plates.includes(c.plate.zh))!;
      const stage = await page
        .locator('.plate-host .plate-stage')
        .evaluate((e) => e.getBoundingClientRect().toJSON() as { x: number; width: number });
      const [pw] = set.size.phone;
      const at = (px: number) => (stage.x + (px / pw) * stage.width) / view.width;
      const edge = 0.02;
      for (const p of set.people) {
        const head = p.phone.head;
        expect(at(head[0]), `${p.id} 頭左緣`).toBeGreaterThanOrEqual(edge);
        expect(at(head[1]), `${p.id} 頭右緣`).toBeLessThanOrEqual(1 - edge);
        const near = c.name === '羈押室門口' && p.id === 'lucas';
        if (near) continue; // 前景的盧卡斯：身體可以被左緣切到，頭不行
        expect(at(p.phone.ink[0]), `${p.id} 身體左緣`).toBeGreaterThanOrEqual(edge - 0.0005);
        expect(at(p.phone.ink[1]), `${p.id} 身體右緣`).toBeLessThanOrEqual(1 - edge + 0.0005);
      }
    });
  }

// 第二道關卡 v93 設計師判定 (b)：手機橫向（≤520 高）字幕卡不蓋在畫面正中間：
// 「繼續」「筆錄」直排在字幕卡右邊，卡和按鈕共用最下面一條，卡片寬度 ≥480。
for (const [w, h] of [
  [863, 360],
  [844, 390],
] as const)
  for (const lang of ['zh', 'en'] as const)
    for (const c of CASES.slice(1)) {
      test(`手機橫向 ${w}×${h}（${lang}，${c.name}）：字幕卡在下三分之一，按鈕直排在卡右邊`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'desktop', '自己設視窗，只跑一次');
        await page.setViewportSize({ width: w, height: h });
        await open(page, c.scene, lang, c.deal);
        await page.locator('.place-beat').click();
        await expect(page.locator('.scene.plated > .sub-card')).toBeVisible();
        const seen: string[] = [];
        for (let i = 0; i < 14; i++) {
          const card = page.locator('.scene.plated > .sub-card');
          if (!(await card.count())) break;
          await page.waitForTimeout(120);
          const m = await page.evaluate(() => {
            const r = (e: Element | null) => e?.getBoundingClientRect();
            const card = document.querySelector('.scene.plated > .sub-card')!;
            const tx = card.querySelector('.tx')!;
            const lh = parseFloat(getComputedStyle(tx).lineHeight);
            const next = document.querySelector<HTMLElement>('.scene.plated .sub-actions .primary');
            const rec = document.querySelector<HTMLElement>(
              '.scene.plated .sub-actions .rec-toggle',
            );
            const eye = r(document.querySelector('.scene.plated > .eyebrow'));
            const menu = r(document.querySelector('.menu-toggle'));
            const c = r(card)!;
            return {
              top: c.top,
              bottom: c.bottom,
              left: c.left,
              right: c.right,
              width: c.width,
              named: !!card.querySelector('.who'),
              lines: Math.round(r(tx)!.height / lh),
              next: r(next) && {
                t: r(next)!.top,
                b: r(next)!.bottom,
                l: r(next)!.left,
                w: r(next)!.width,
                h: r(next)!.height,
              },
              rec: r(rec) && {
                t: r(rec)!.top,
                b: r(rec)!.bottom,
                l: r(rec)!.left,
                h: r(rec)!.height,
              },
              eye: eye && { b: eye.bottom, r: eye.right },
              menu: menu && { l: menu.left, t: menu.top, b: menu.bottom },
              vh: innerHeight,
              vw: innerWidth,
            };
          });
          const tag = `${m.named ? '名字＋' : ''}${m.lines} 行，上緣 ${(m.top / m.vh).toFixed(3)}`;
          seen.push(tag);
          // 一行卡整張落在下三分之一；有名字的卡上緣 ≥60%（兩行帶名字的卡本身就約 117px，塞不進三分之一）。
          expect(m.top / m.vh, `${tag} 的卡`).toBeGreaterThanOrEqual(
            m.named || m.lines > 1 ? 0.6 : 2 / 3,
          );
          expect(m.bottom, `${tag} 卡的下緣貼著安全邊距`).toBeGreaterThan(m.vh - 24);
          expect(m.bottom).toBeLessThanOrEqual(m.vh - 8);
          expect(m.width).toBeGreaterThanOrEqual(480);
          // 按鈕直排在卡右邊：「繼續」在上、「筆錄」在下，高度 ≥44，下面那顆和卡共用最下面一條。
          expect(m.next).toBeTruthy();
          expect(m.next!.h).toBeGreaterThanOrEqual(44);
          expect(m.rec!.h).toBeGreaterThanOrEqual(44);
          expect(m.next!.l).toBeGreaterThanOrEqual(m.right);
          expect(Math.abs(m.next!.l - m.rec!.l)).toBeLessThanOrEqual(1);
          expect(m.next!.b).toBeLessThanOrEqual(m.rec!.t + 1);
          expect(Math.abs(m.rec!.b - m.bottom)).toBeLessThanOrEqual(1);
          // 不蓋到左上的地點眉標和「選單」鈕。
          expect(m.top).toBeGreaterThanOrEqual(m.eye!.b);
          expect(m.right <= m.menu!.l || m.top >= m.menu!.b).toBe(true);
          expect(m.next!.l + m.next!.w).toBeLessThanOrEqual(m.vw);
          const go = page.locator('.scene.plated .sub-actions .primary');
          if (!(await go.count())) break;
          await go.click();
        }
        expect(seen.length).toBeGreaterThanOrEqual(3);
      });
    }

// 第二道關卡 v93 第 1 處：底圖已經在畫面上的時候，換場（地點字卡→場景、理論開場→選理論）底圖不卸載、不黑一下、
// 立牌不會單獨浮在黑底上。底圖是 App 掛的共用一層（PlateHost）：整段換場每一個畫格都是同一個元素、舞台不透明度 1。
for (const [w, h] of [
  [1440, 900],
  [412, 839],
] as const)
  for (const lang of ['zh', 'en'] as const)
    for (const c of CASES) {
      test(`${c.name}（${lang}，${w}×${h}）：地點字卡進場景，底圖不卸載、每一格都亮著`, async ({
        page,
      }, info) => {
        test.skip(info.project.name !== 'desktop', '自己設視窗，只跑一次');
        await page.setViewportSize({ width: w, height: h });
        await open(page, c.scene, lang, c.deal);
        const plate = page.locator('.scene-plate');
        await expect(plate).toHaveAttribute('data-state', 'ok');
        // 定場亮起來（淡入結束）再開始錄每一格。
        await page.waitForFunction(
          () => Number(getComputedStyle(document.querySelector('.plate-stage')!).opacity) >= 0.99,
        );
        await page.evaluate(() => {
          const w = window as unknown as { __frames: unknown[]; __stop: boolean; __el: Element };
          w.__el = document.querySelector('.scene-plate')!;
          w.__frames = [];
          w.__stop = false;
          const tick = () => {
            const el = document.querySelector('.scene-plate');
            const stage = document.querySelector('.plate-stage');
            const imgs = [...document.querySelectorAll<HTMLImageElement>('.scene-plate img')];
            w.__frames.push({
              same: el === w.__el,
              op: stage ? Number(getComputedStyle(stage).opacity) : -1,
              imgs: imgs.length && imgs.every((i) => i.complete && i.naturalWidth > 0),
            });
            if (!w.__stop) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await page.locator('.place-beat').click();
        await expect(page.locator('.scene.plated .sub-card')).toBeVisible();
        if (c.scene === 13) {
          // 理論開場翻到最後一張，切到選理論那一頁：同一張底圖壓暗，不閃黑。
          const next = page.locator('.scene.plated .primary');
          for (
            let i = 0;
            i < 12 &&
            !(await page.getByRole('button', { name: /選擇案件理論|Choose case theory/ }).count());
            i++
          )
            await next.click();
          await page.getByRole('button', { name: /選擇案件理論|Choose case theory/ }).click();
          await expect(page.locator('.theory-card').first()).toBeVisible();
        }
        await page.waitForTimeout(500);
        const frames = await page.evaluate(() => {
          const w = window as unknown as {
            __frames: { same: boolean; op: number; imgs: boolean }[];
            __stop: boolean;
          };
          w.__stop = true;
          return w.__frames;
        });
        expect(frames.length).toBeGreaterThan(20);
        const bad = frames.filter((f) => !f.same || f.op < 0.99 || !f.imgs);
        expect(bad.length, `${frames.length} 格裡有 ${bad.length} 格底圖不見、變淡或圖沒畫好`).toBe(
          0,
        );
      });
    }
