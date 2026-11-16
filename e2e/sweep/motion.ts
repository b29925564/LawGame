import type { Page } from '@playwright/test';

/** #178 聲請狀：請求、依據點空格選 option；證物電腦版點證據欄的卡，手機開抽屜；按「遞狀」或「重新遞狀」。 */
export async function fileMotion(page: Page, request: string, basis: string, exhibit: RegExp) {
  const paper = page.locator('article.plead').first();
  const pick = async (blank: RegExp, opt: string) => {
    const b = paper.getByRole('button', { name: blank }).first();
    if (new RegExp(`：${opt}$`).test((await b.getAttribute('aria-label')) || '')) return;
    await b.click();
    await page.getByRole('option', { name: opt, exact: true }).click();
  };
  await pick(/^(點這裡選請求|請求：)/, request);
  await pick(/^(點這裡選依據|法律依據：)/, basis);
  const slot = paper.locator('button.blank.exhibit').first();
  if (!exhibit.test((await slot.getAttribute('aria-label')) || '')) {
    const side = page.locator('li.card.mini.pickable', { hasText: exhibit });
    if (
      await side
        .first()
        .isVisible()
        .catch(() => false)
    )
      await side.first().getByRole('button').first().click();
    else {
      await slot.click();
      await page.locator('.card-sheet .pick-name', { hasText: exhibit }).first().click();
    }
  }
  await paper.getByRole('button', { name: /遞狀/ }).click();
}

/** 法庭畫面上「准」「駁回」大章。 */
export const ruling = (page: Page) =>
  page
    .locator('.stamp-big')
    .first()
    .getAttribute('aria-label', { timeout: 5000 })
    .catch(() => null);
