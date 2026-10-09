import { expect, test } from '@playwright/test';

// 光敏安全（設定集 10.6／11.3）：設定頁開關寫進 rd.a11y.photosafe，啟動時同步到 <html data-photosafe>；
// 網址 ?photosafe=1 只在那一頁暫時開啟，不寫進設定。
test('光敏安全：開關存起來、重新整理後保留；網址參數只暫時開啟', async ({ page }) => {
  const html = page.locator('html');
  await page.goto('/?photosafe=1');
  await expect(html).toHaveAttribute('data-photosafe', '1');
  await page.goto('/');
  await expect(html).toHaveAttribute('data-photosafe', '0');

  await page.getByRole('button', { name: '新遊戲' }).click();
  await page.getByRole('button', { name: /^第 1 集/ }).click();
  await page.getByRole('button', { name: '選單' }).click();
  await page.getByRole('tab', { name: '選項' }).click();
  const box = page.getByRole('checkbox', { name: /光敏安全/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(html).toHaveAttribute('data-photosafe', '1');
  expect(await page.evaluate(() => localStorage.getItem('rd.a11y.photosafe'))).toBe('1');

  await page.reload();
  await expect(html).toHaveAttribute('data-photosafe', '1');
});
