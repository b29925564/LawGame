/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

// #225 設計師審查裡歸介面與操作的幾項：定場、配角頭像、單色鎖、鎖住的理論卡、集尾卡。
async function open(page: Page, episode: string, scene: number, lang = 'zh-TW') {
  await page.goto('/');
  await page.evaluate(
    ([episode, scene, lang]) => {
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
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [episode, scene, lang] as const,
  );
  await page.reload();
  await page
    .getByRole('button', { name: /^(繼續|Continue)/ })
    .first()
    .click();
}

test('換地點：先放一格場記（一行），演完才掛介面', async ({ page }) => {
  await open(page, 'ep1', 13);
  const beat = page.locator('.place-beat');
  await expect(beat).toBeVisible();
  // 場記還在的時候，這一場的介面一個都還沒掛。
  await expect(page.locator('.speech')).toHaveCount(0);
  await expect(page.locator('.place-slate')).toBeVisible();
  // 定場還沒有鏡頭：左上標占位。
  await expect(page.locator('.place-tbd')).toContainText('待放 3D 機位');
  const h = await page.locator('.place-slate').evaluate((e) => e.getBoundingClientRect().height);
  expect(h).toBeLessThan(40);
  await beat.click();
  await expect(page.locator('.place-beat')).toHaveCount(0);
  await expect(page.locator('.speech').first()).toBeVisible();
  // 配角的頭像是檔案照（姓的第一個字），不是程式畫的卡通臉。
  await expect(page.locator('.speech .portrait.id .idphoto .ph b').first()).toHaveText('海');
  await expect(page.locator('svg.portrait')).toHaveCount(0);
});

test('鎖住的理論卡：不透明、不用紅；沒有 🔒 表情符號', async ({ page }) => {
  await open(page, 'ep1', 13);
  await page.locator('.place-beat').click();
  await page.getByRole('button', { name: /選擇案件理論/ }).click();
  const locked = page.locator('.theory-card.locked').first();
  await expect(locked).toBeVisible();
  expect(await locked.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  const missing = locked.locator('.theory-missing');
  await expect(missing.locator('.lock-icon')).toHaveCount(1);
  const [weight, color, text] = await page.evaluate(() => {
    const m = document.querySelector('.theory-card.locked .theory-missing')!;
    return [
      getComputedStyle(m).fontWeight,
      getComputedStyle(m).color,
      getComputedStyle(document.body).color,
    ];
  });
  expect(parseInt(weight)).toBeGreaterThanOrEqual(700);
  expect(color).toBe(text);
  expect(await page.locator('body').innerText()).not.toContain('🔒');
});

test('集尾卡：第 2 集和第 1 集同版型，「本集共製作 N 頁」等於最後一頁', async ({ page }) => {
  for (const episode of ['ep1', 'ep2']) {
    await open(page, episode, 999);
    const total = page.locator('.act-total');
    await expect(total).toBeVisible();
    const [pages, bates] = await page.evaluate(() => [
      document.querySelector('.act-total')!.textContent!.replace(/\D/g, ''),
      document.querySelector('.act-bates')!.textContent!.replace(/\D/g, ''),
    ]);
    expect(Number(pages)).toBe(Number(bates.slice(2)));
    await expect(page.locator('.act-title')).toHaveText('待續');
    await expect(page.locator('.act-kick')).toContainText('第');
  }
});

test('第 2 集結束卡：標題欄寫原告全名；最後一場沒寫地點，場記空著', async ({ page }) => {
  await open(page, 'ep2', 999);
  await expect(page.locator('.act-caption')).toContainText('瑪莉索・維加，');
  await expect(page.locator('.act-slate')).toHaveCount(0);
  // Bates 的右緣和場記的右緣是同一條（70u）。
  await open(page, 'ep1', 45);
  const [a, b] = await page.evaluate(() => [
    document.querySelector('.act-slate')!.getBoundingClientRect().right,
    document.querySelector('.act-bates')!.getBoundingClientRect().right,
  ]);
  expect(Math.abs(a - b)).toBeLessThan(2);
});
