import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 剪影就是定稿（使用者 11-16，設計師 remove-portrait-tag 規格）：
 * 不再有「待放 AI 立繪」標籤或虛線框；標籤空出來的位置收回，剪影旁的字不貼著剪影、不被蓋住。
 */
const seeds = JSON.parse(
  readFileSync(new URL('./fixtures/hung-jury.json', import.meta.url), 'utf8'),
) as Record<'ep1', { scene: number; step: number; scenes: Record<string, unknown> }>;
const kowalski = JSON.parse(
  readFileSync(new URL('./fixtures/court-kowalski.json', import.meta.url), 'utf8'),
) as Record<'ep1', unknown>;

async function open(page: Page, progress: unknown) {
  await page.addInitScript(
    (save) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', save);
    },
    JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^繼續（/ })
    .first()
    .click();
}

/** 畫面上沒有標籤字、也沒有虛線（虛線只准撕開的借據用）。 */
async function noPlaceholder(page: Page) {
  await expect(page.getByText('待放 AI 立繪')).toHaveCount(0);
  const dashed = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          '.portrait.sil, .jf-face, .idphoto, .silcard, .cands, .jb-grid',
        ),
      ]
        .flatMap((el) => [el, ...el.querySelectorAll('*')])
        .filter((el) => {
          const s = getComputedStyle(el);
          return (
            s.borderStyle.includes('dashed') || (el.getAttribute('stroke-dasharray') ?? '') !== ''
          );
        }).length,
  );
  expect(dashed).toBe(0);
}

test('判決頁：陪審長和法庭裡說話的人只有剪影，字排在剪影旁邊不重疊', async ({ page }) => {
  await open(page, seeds.ep1);
  const fore = page.locator('.panel.fore');
  await expect(fore).toBeVisible({ timeout: 90_000 });
  // 陪審長的全名寫在剪影旁（標籤拿掉後，名字不能跟著消失）。
  await expect(fore.locator('.who').first()).toHaveText('海倫・杜根');
  const msg = page.locator('.epi .msg:has(> .portrait.sil)').first();
  await expect(msg).toBeVisible({ timeout: 30_000 });
  const gap = await msg.evaluate((el) => {
    const sil = el.querySelector(':scope > .portrait.sil')!.getBoundingClientRect();
    const text = el.querySelector(':scope > div')!.getBoundingClientRect();
    return text.left - sil.right;
  });
  expect(gap).toBeGreaterThanOrEqual(8);
  await noPlaceholder(page);
});

test('陪審團遴選：名單和陪審席只有剪影', async ({ page }) => {
  const p = structuredClone(seeds.ep1);
  p.scene = 15;
  p.step = 0;
  delete p.scenes['voir-dire'];
  await open(page, p);
  await page.getByRole('button', { name: '開始遴選' }).click();
  await expect(page.locator('.cands').first()).toBeVisible();
  await noPlaceholder(page);
});

test('法庭：陪審席和證人只有剪影，手機上說話的人名字寫在剪影上方', async ({ page }, info) => {
  await open(page, kowalski.ep1);
  await page.getByRole('button', { name: '開庭' }).click();
  await expect(page.getByRole('button', { name: '聽下一個問題' })).toBeVisible();
  await noPlaceholder(page);
  if (info.project.name !== 'chromium') return;
  const now = page.locator('.court-now');
  await expect(now.locator('> .who')).toHaveText('柯瓦斯基');
  const [who, face] = await Promise.all([
    now.locator('> .who').boundingBox(),
    now.locator('.portrait.sil').boundingBox(),
  ]);
  expect(who!.y + who!.height).toBeLessThanOrEqual(face!.y + 1);
});
