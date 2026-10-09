import { expect, test, type Page } from '@playwright/test';

async function openOptions(page: Page) {
  await page.getByRole('button', { name: '新遊戲' }).click();
  await page.getByRole('button', { name: /^第 1 集/ }).click();
  await page.getByRole('button', { name: '選單' }).click();
  await page.getByRole('tab', { name: '選項' }).click();
}

// 光敏安全（設定集 10.6／11.3）：設定頁開關寫進 rd.a11y.photosafe，啟動時同步到 <html data-photosafe>；
// 網址 ?photosafe=1 只在那一頁暫時開啟，不寫進設定。
test('光敏安全：開關存起來、重新整理後保留；網址參數只暫時開啟', async ({ page }) => {
  const html = page.locator('html');
  await page.goto('/?photosafe=1');
  await expect(html).toHaveAttribute('data-photosafe', '1');
  await page.goto('/');
  await expect(html).toHaveAttribute('data-photosafe', '0');

  await openOptions(page);
  const box = page.getByRole('checkbox', { name: /光敏安全/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(html).toHaveAttribute('data-photosafe', '1');
  expect(await page.evaluate(() => localStorage.getItem('rd.a11y.photosafe'))).toBe('1');
  // 兩個開關互不連動。
  await expect(page.getByRole('checkbox', { name: /減少動態/ })).not.toBeChecked();
  await expect(html).not.toHaveAttribute('data-reduced-motion');

  await page.reload();
  await expect(html).toHaveAttribute('data-photosafe', '1');
});

/**
 * 樣式探針：reduce 區塊（.notif-hint 停掉動畫）與 no-preference 區塊（.cork-focus 才有轉場）各量一個。
 * moving＝照常動，否則＝減少動態。
 */
async function expectMotion(page: Page, moving: boolean) {
  if (!(await page.locator('#rm-probe').count()))
    await page
      .locator('body')
      .evaluate((body) =>
        body.insertAdjacentHTML(
          'beforeend',
          '<div id="rm-probe" hidden><div class="notif-hint"></div><div class="cork-focus"></div></div>',
        ),
      );
  await expect(page.locator('#rm-probe .notif-hint')).toHaveCSS(
    'animation-name',
    moving ? 'notif-hint' : 'none',
  );
  await expect(page.locator('#rm-probe .cork-focus')).toHaveCSS(
    'transition-duration',
    moving ? '0.18s' : '0s',
  );
}

// 減少動態（設定集 10.6 開關二）：預設跟隨系統；玩家設定後存 rd.a11y.reducedmotion、同步到 <html data-reduced-motion>，
// CSS 兩個來源都認：系統要減少但玩家關掉就照常動，系統沒要求但玩家打開就減少。
test('減少動態：預設跟隨系統，玩家設定蓋過系統，和光敏安全互不連動', async ({ page }) => {
  const html = page.locator('html');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(html).not.toHaveAttribute('data-reduced-motion');
  await expectMotion(page, false);

  await openOptions(page);
  const box = page.getByRole('checkbox', { name: /減少動態/ });
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(html).toHaveAttribute('data-reduced-motion', '0');
  await expect(html).toHaveAttribute('data-photosafe', '0');
  expect(await page.evaluate(() => localStorage.getItem('rd.a11y.reducedmotion'))).toBe('0');
  await expectMotion(page, true);
  await page.reload();
  await expectMotion(page, true);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => localStorage.setItem('rd.a11y.reducedmotion', '1'));
  await page.reload();
  await expect(html).toHaveAttribute('data-reduced-motion', '1');
  await expectMotion(page, false);

  await page.evaluate(() => localStorage.removeItem('rd.a11y.reducedmotion'));
  await page.reload();
  await expectMotion(page, true);
});
