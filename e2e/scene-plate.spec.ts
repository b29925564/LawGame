/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
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

async function open(page: Page, scene: number, lang: 'zh' | 'en', deal?: string) {
  await page.goto('/');
  await page.evaluate(
    ([scene, lang, deal]) => {
      localStorage.setItem('lawgame-lang', lang as string);
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
    [scene, lang, deal] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
}

for (const lang of ['zh', 'en'] as const)
  for (const c of CASES) {
    test(`${c.name}（${lang}）：定場是底圖，色溫讀燈組，手機用手機版`, async ({ page }, info) => {
      await open(page, c.scene, lang, c.deal);
      const plate = page.locator('.place-beat .scene-plate');
      await expect(plate).toHaveAttribute('data-plate', c.plate[lang]);
      await expect(plate).toHaveAttribute('data-rig', c.rig);
      await expect(plate).toHaveAttribute('data-kelvin', String(rigs[c.rig].kelvin));
      await expect(plate).toHaveAttribute('data-state', 'ok');
      const phone = info.project.name === 'chromium';
      const img = plate.locator('img');
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
      const bg = page.locator('.scene.plated > .scene-plate');
      await expect(bg).toHaveAttribute('data-plate', c.plate[lang]);
      await expect(bg).toHaveAttribute('data-state', 'ok');
      const [w, h] = view;
      const top = await page.evaluate(
        ([w, h]) => {
          // 底圖不吃指標事件，點得到的是它前面的東西：只要不是台詞框、按鈕、眉標、選單，就是空的、看得見圖。
          const hit = (fx: number, fy: number) =>
            !document.elementFromPoint(w * fx, h * fy)?.closest('.lines, button, .eyebrow, dialog');
          const lines = document.querySelector('.scene.plated > .lines')!.getBoundingClientRect();
          return {
            open: [0.15, 0.5, 0.85].every((fx) => [0.2, 0.3, 0.4].every((fy) => hit(fx, fy))),
            linesTop: lines.top / h,
          };
        },
        [w, h],
      );
      expect(top.open).toBe(true);
      expect(top.linesTop).toBeGreaterThan(0.5);
      await expect(page.locator('.scene.plated > .lines')).toBeVisible();
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
    await expect(page.locator('.place-beat .scene-plate')).toHaveAttribute('data-state', 'ok');
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
  const bg = page.locator('.scene.plated > .scene-plate');
  await expect(page.locator('.scene.dialogue')).toBeVisible();
  await expect(bg).toBeVisible();
  const color = await bg.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(color).toBe('rgb(0, 0, 0)');
  await expect(bg).toHaveAttribute('data-state', 'ok', { timeout: 5000 });
});

test('沒有底圖的場景照舊：定場放占位字，對話不貼底', async ({ page }) => {
  await open(page, 12, 'zh');
  await expect(page.locator('.place-beat .scene-plate')).toHaveCount(0);
  await expect(page.locator('.place-tbd')).toContainText('待放 3D 機位');
  await page.locator('.place-beat').click();
  await expect(page.locator('.scene.dialogue')).toBeVisible();
  await expect(page.locator('.scene-plate')).toHaveCount(0);
  await expect(page.locator('.scene.plated')).toHaveCount(0);
});

test('案件理論：開場那一頁有底圖；選理論那一頁留著同一張，壓暗 58%，卡片照舊', async ({ page }) => {
  await open(page, 13, 'zh');
  await page.locator('.place-beat').click();
  await expect(page.locator('.scene.plated > .scene-plate')).toHaveAttribute('data-plate', 's1-an');
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

test('底圖上的台詞框：半透明加模糊、上緣不淡出；有底圖就沒有盧卡斯大圖；眉標一行', async ({
  page,
}) => {
  await open(page, 33, 'zh', 'o-probation');
  await page.locator('.place-beat').click();
  const lines = page.locator('.scene.plated > .lines');
  await expect(lines).toBeVisible();
  const st = await lines.evaluate((e) => {
    const c = getComputedStyle(e);
    return { blur: c.backdropFilter, mask: c.maskImage, bg: c.backgroundColor };
  });
  expect(st.blur).toContain('blur(8px)');
  expect(st.mask).toBe('none');
  // --panel-glass 帶透明度（不是實心紙色）
  expect(st.bg).toMatch(/rgba\(.*0\.\d+\)/);
  await expect(page.locator('.lucas-stage')).toHaveCount(0);
  const eyebrow = page.locator('.plate-eyebrow');
  const box = await eyebrow.boundingBox();
  const lh = await eyebrow.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
  expect(box!.height).toBeLessThan(lh * 2);
});

test('底圖上的畫外字幕：走鏡頭層，只壓暗圖、不用紙色蓋掉；滑鼠靠近也不變色', async ({ page }) => {
  await open(page, 33, 'zh', 'o-probation');
  await page.locator('.place-beat').click();
  // 最後一句（盧卡斯的畫外字幕）
  for (let i = 0; i < 3; i++) {
    await page.locator('.scene.plated .primary').click();
  }
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
  await expect(page.locator('.scene.plated > .scene-plate')).toHaveAttribute('data-state', 'ok');
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
  for (let i = 0; i < 3; i++) await page.locator('.scene.plated .primary').click();
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
