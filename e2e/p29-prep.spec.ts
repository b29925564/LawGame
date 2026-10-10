/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

// P2-9 證人準備：索引卡、夾著的筆錄影本、選取與確認鈕。
async function open(
  page: Page,
  episode: string,
  scene: number,
  opts: { lang?: string; flags?: string[] } = {},
) {
  await page.goto('/');
  await page.evaluate(
    ([episode, scene, lang, flags]) => {
      localStorage.setItem('lawgame-lang', lang as string);
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode,
            scene,
            step: 0,
            choices: {},
            cards: [],
            flags,
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [episode, scene, opts.lang ?? 'zh-TW', opts.flags ?? []] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
  const beat = page.locator('.place-beat');
  if (await beat.count()) await beat.click();
  await page.locator('button.primary.next').first().click();
  await expect(page.locator('main.prep')).toBeVisible();
}

const TREVOR = 20;

test('兩張索引卡：鉛筆字、不透明；確認鈕沒選前是實線框，不是黃', async ({ page }) => {
  await open(page, 'ep2', TREVOR);
  const cards = page.locator('.prep-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('只問他確定的事');
  await expect(cards.nth(1)).toContainText('替他寫好答案');
  for (const c of await cards.all()) {
    expect(await c.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
    const paper = c.locator('.card-paper');
    // 盧卡斯的鉛筆：LXGW、--pencil。
    const [font, color] = await paper.evaluate((e) => [
      getComputedStyle(e).fontFamily,
      getComputedStyle(e).color,
    ]);
    expect(font).toContain('LXGW');
    expect(color).toBe('rgb(52, 64, 79)');
  }
  const btn = page.locator('.prep-bar button.primary');
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveText('就這樣準備（−2 工時）');
  const s = await btn.evaluate((e) => {
    const c = getComputedStyle(e);
    return [c.opacity, c.borderTopWidth, c.borderTopStyle, c.backgroundColor];
  });
  expect(s[0]).toBe('1');
  expect(s[1]).toBe('1px');
  expect(s[2]).toBe('solid');
  expect(s[3]).toBe('rgba(0, 0, 0, 0)');
});

test('選取：一次一張、2px 墨框、不放大；整個畫面只有確認鈕是黃', async ({ page }) => {
  await open(page, 'ep2', TREVOR);
  const cards = page.locator('.prep-card');
  await cards.nth(1).click();
  await expect(cards.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(cards.nth(0)).toHaveAttribute('aria-checked', 'false');
  // 方向鍵換卡：焦點和選取一起走，仍然只有一張。
  await page.keyboard.press('ArrowLeft');
  await expect(cards.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.prep-card[aria-checked="true"]')).toHaveCount(1);
  await cards.nth(1).click();
  await page.waitForTimeout(400);
  const frame = await cards
    .nth(1)
    .locator('.card-paper')
    .evaluate((e) => {
      const c = getComputedStyle(e, '::after');
      return [c.opacity, c.borderTopWidth, c.borderTopColor, getComputedStyle(e).transform];
    });
  expect(frame[0]).toBe('1');
  expect(frame[1]).toBe('2px');
  expect(frame[3]).toBe('none');
  // 沒選中的卡維持原樣。
  expect(await cards.nth(0).evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  // 黃：只有確認鈕。
  const yellow = await page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.background = 'var(--hl)';
    document.body.append(probe);
    const hl = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [...document.querySelectorAll('main.prep *')].filter((e) => {
      const c = getComputedStyle(e);
      return (
        c.backgroundColor === hl ||
        (c.borderTopWidth !== '0px' && c.borderTopColor === hl) ||
        (c.outlineStyle !== 'none' && c.outlineColor === hl) ||
        c.boxShadow.includes(hl)
      );
    }).length;
  });
  expect(yellow).toBe(1);
  await expect(page.locator('.prep-bar button.primary')).toBeEnabled();
  // 沒有紅色的字、框、底。
  const red = await page.evaluate(
    () =>
      [...document.querySelectorAll('main.prep *')].filter((e) => {
        const c = getComputedStyle(e);
        return [c.color, c.backgroundColor, c.borderTopColor].some((v) => {
          const m = v.match(/\d+/g)?.map(Number);
          return m && m.length >= 3 && m[0] > 170 && m[1] < 90 && m[2] < 90;
        });
      }).length,
  );
  expect(red).toBe(0);
});

test('夾著的筆錄：從第 42 頁剪下的一條，答案從 cite（42:7）起；中英文；卡面是紅頂線＋藍橫線', async ({
  page,
}) => {
  await open(page, 'ep2', TREVOR);
  const card = page.locator('.prep-card').nth(1);
  const copy = card.locator('.prep-copy');
  // 筆錄元件排的行：每一行都有行號，答的第一行是 7；沒有頁首、沒有宣誓句、沒有說明字。
  const rows = copy.locator('.rec-row');
  const nos = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-no')));
  expect(nos).toEqual(['5', '6', '7', '8', '9', '10', '11', '12']);
  const answer = copy.locator('.rec-row', { has: page.locator('.rec-tag', { hasText: '答' }) });
  await expect(answer).toHaveAttribute('data-no', '7');
  await expect(answer).toContainText('從系統上線就是提醒，從來沒有強制下線過。');
  await expect(copy).not.toContainText('宣誓所言屬實');
  await expect(copy.locator('.rec-head')).toHaveCount(0);
  await expect(copy).toHaveAttribute('data-page', '42');
  // 頁碼由盧卡斯的鉛筆寫在卡上最後一條線。
  await expect(card.locator('.cite')).toHaveText('米爾斯錄取筆錄 42:7–9');
  await expect(page.locator('.prep-card').nth(0).locator('.prep-copy')).toHaveCount(0);
  await expect(page.locator('.prep-copy')).toHaveCount(1);
  expect(
    await copy.locator('.rec-paper').evaluate((e) => getComputedStyle(e).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');
  // 卡名下面是 1px 紅頂線（--paper-margin，材質不是語意）；其餘橫線是藍的。
  const label = await card.locator('.label').evaluate((e) => {
    const c = getComputedStyle(e);
    return [c.borderBottomWidth, c.borderBottomColor];
  });
  expect(label).toEqual(['1px', 'rgb(217, 83, 79)']);
  await page.goto('/');
  await open(page, 'ep2', TREVOR, { lang: 'en' });
  const en = page.locator('.prep-card').nth(1);
  const enNos = await en
    .locator('.prep-copy .rec-row')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-no')));
  expect(enNos).toEqual(['5', '6', '7', '8', '9', '10', '11', '12']);
  await expect(
    en.locator('.prep-copy .rec-row', { has: page.locator('.rec-tag', { hasText: 'A.' }) }),
  ).toHaveAttribute('data-no', '7');
  await expect(en.locator('.cite')).toHaveText('Mills Dep. 42:7–9');
  // 英文手寫也是 LXGW。
  const font = await en.locator('.card-paper').evaluate((e) => getComputedStyle(e).fontFamily);
  expect(font).toContain('LXGW');
});

test('卡面尺寸：100% 字級時每張卡 5:3（400×240），中英文一樣', async ({ page }) => {
  for (const lang of ['zh-TW', 'en']) {
    await open(page, 'ep2', TREVOR, { lang });
    if ((page.viewportSize()?.width ?? 1440) < 768) continue;
    for (const c of await page.locator('.prep-card .card-paper').all()) {
      const b = (await c.boundingBox())!;
      expect(Math.abs(b.width - 400)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.height - 240)).toBeLessThanOrEqual(1);
    }
    await page.goto('/');
  }
});

test('勘誤過（trevor-corrected）：「替他寫好答案」整張不出現', async ({ page }) => {
  await open(page, 'ep2', TREVOR, { flags: ['trevor-corrected'] });
  await expect(page.locator('.prep-card')).toHaveCount(1);
  await expect(page.locator('.prep-card')).toContainText('只問他確定的事');
  await expect(page.locator('.prep-copy')).toHaveCount(0);
  await expect(page.getByText('替他寫好答案')).toHaveCount(0);
});

test('版面：影本夾在卡後垂在卡下；手機確認鈕固定在底部', async ({ page }) => {
  await open(page, 'ep2', TREVOR);
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  const card = page.locator('.prep-card').nth(1);
  await card.click();
  const paper = await card.locator('.card-paper').boundingBox();
  const copy = await card.locator('.prep-copy').boundingBox();
  const btn = await page.locator('.prep-bar button.primary').boundingBox();
  const vh = page.viewportSize()!.height;
  expect(paper && copy && btn).toBeTruthy();
  if (mobile) {
    // 影本垂在卡下方（上緣 6px 藏在卡後）；確認鈕在視窗最下面。
    expect(copy!.y).toBeGreaterThanOrEqual(paper!.y + paper!.height - 8);
    expect(btn!.y + btn!.height).toBeGreaterThan(vh - 40);
    expect(paper!.width).toBeGreaterThan(300);
  } else {
    // 影本夾在卡的下緣後面，整條垂在卡下方，鉛筆字不會被蓋到。
    expect(paper!.width).toBeCloseTo(400, 0);
    expect(copy!.y).toBeGreaterThanOrEqual(paper!.y + paper!.height - 8);
    expect(copy!.y).toBeLessThan(paper!.y + paper!.height);
    // 確認鈕在右欄下方靠右，不被影本蓋住。
    expect(btn!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height);
  }
});

test('確認：不蓋章，沒選的淡出，然後進直接詰問；減少動態時直接切', async ({ page }) => {
  await open(page, 'ep2', TREVOR);
  await page.locator('.prep-card').nth(0).click();
  await page.locator('.prep-bar button.primary').click();
  await expect(page.locator('.stamp')).toHaveCount(0);
  await expect(page.locator('.eyebrow')).toContainText('直接詰問', { timeout: 3000 });
  // 減少動態：一點就切。
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'ep2', TREVOR);
  await page.locator('.prep-card').nth(0).click();
  await page.locator('.prep-bar button.primary').click();
  await expect(page.locator('.eyebrow')).toContainText('直接詰問', { timeout: 500 });
});

test('第 1 集的證人也走這個畫面：三張卡，沒筆錄就沒影本', async ({ page }) => {
  await open(page, 'ep1', 22);
  await expect(page.locator('.prep-card')).toHaveCount(3);
  await expect(page.locator('.prep-copy')).toHaveCount(0);
  await expect(page.locator('.prep-bar button.primary')).toBeDisabled();
});
