import { expect, test, type Page } from '@playwright/test';

// 第 1 集的警方現場照片在週一 16:05 開示送到之後才出現（content/slates/2026-10-10-police-photos-timing.md）：
// take-case 最後一句「最上面是警方報告。附件二……」之後一頁，第二幕幕卡之前。卷宗的警方報告附同一份。
async function load(page: Page, scene: number, step: number) {
  await page.goto('/');
  await page.evaluate(
    ([scene, step]) => {
      localStorage.setItem(
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          label: 'x',
          progress: {
            episode: 'ep1',
            scene,
            step,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      );
    },
    [scene, step] as const,
  );
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
}

test('16:05 開示送到：最後一句之後是附件二的照片頁，頁首是附件封面那一行，不放場記', async ({
  page,
}) => {
  await load(page, 5, 13);
  await expect(page.getByText('最上面是警方報告。附件二，現場照片，四十八張。')).toBeVisible();
  await page.locator('button.primary.next').click();

  await expect(
    page.getByRole('heading', { name: '警方報告　附件二：現場照片（共 48 張）　檢方開示第一批' }),
  ).toBeVisible();
  // 攤在桌上的附件封面紙，不是鏡頭：不放場記。
  await expect(page.locator('.photo-sheet .cine-time')).toHaveCount(0);
  const photos = page.getByRole('list', { name: '現場照片' });
  await expect(photos.getByRole('img')).toHaveCount(3, { timeout: 15000 });
  await expect(photos.getByRole('img').first()).toHaveAccessibleName(/全景/);
  await expect(photos.locator('.photolog-redact')).toHaveText('照片已遮蔽');
  await expect(photos.locator('.photolog-bates')).toHaveText([
    'CPD-000301',
    'CPD-000302',
    'CPD-000303',
  ]);
  // 每張照片紀錄表自己帶拍攝時間（週六凌晨），收到的是週一。
  await expect(photos.locator('.photolog-strip')).toContainText([
    '03/14 01:12',
    '03/14 01:16',
    '03/14 01:19',
  ]);
  await photos.getByRole('button', { name: /放大檢視 全景/ }).click();
  await expect(page.getByRole('dialog', { name: /放大檢視 全景/ })).toBeVisible();
  await page.getByRole('button', { name: '關閉' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // 「繼續」不是黃的：這一頁的黃是獎盃照片裡的證物牌（一格一黃）。
  await expect(page.getByRole('button', { name: '繼續' })).not.toHaveClass(/primary/);
  await page.getByRole('button', { name: '繼續' }).click();
  await expect(page.getByRole('heading', { name: '調查' })).toBeVisible();
});

test('卷宗的警方報告：紙欄寬時附件二那一行下面是同三張照片紀錄表', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await load(page, 7, 0);
  await page.getByRole('button', { name: /^卷宗/ }).first().click();
  await page.getByRole('button', { name: /警方報告與附件/ }).click();
  await expect(
    page.getByText('附件二為現場照片 48 張（CPD-000301–000348），本批附第 1 至 3 張。'),
  ).toBeVisible();
  const photos = page.locator('.doc-photos').getByRole('list', { name: '現場照片' });
  await expect(photos.locator('.photolog-bates')).toHaveText([
    'CPD-000301',
    'CPD-000302',
    'CPD-000303',
  ]);
});

test('手機卷宗：一列三張縮圖，案號和攝影者寫一次，點了放大是完整紀錄表', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page, 7, 0);
  await page.getByRole('button', { name: /^卷宗/ }).first().click();
  await page.getByRole('button', { name: /警方報告與附件/ }).click();
  const box = page.locator('.doc-photos');
  await expect(box.locator('.photo-thumbs-head')).toContainText('CH-2026-1147');
  await expect(box.locator('.photo-thumbs-head')).toContainText('M. Duarte');
  const photos = box.getByRole('list', { name: '現場照片' });
  await expect(photos.locator('.photolog-strip')).toHaveCount(0);
  await expect(photos.locator('.photolog-thumb-bates')).toHaveText([
    'CPD-000301',
    'CPD-000302',
    'CPD-000303',
  ]);
  const tops = await photos
    .locator('li')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  const hit = photos.getByRole('button', { name: /放大檢視 .*獎盃/ });
  expect((await hit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await hit.click();
  const dialog = page.getByRole('dialog', { name: /放大檢視 .*獎盃/ });
  await expect(dialog.locator('.photolog-strip')).toContainText(['03/14 01:19']);
  await expect(dialog.locator('.photolog-bates')).toHaveText('CPD-000303');
});
