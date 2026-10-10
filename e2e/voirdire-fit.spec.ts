import { expect, test } from '@playwright/test';

/**
 * 關卡 2 第 17 條：1100 寬時陪審席只有 380px，6 張 72px 的席位卡互相疊 7px。
 * 席位卡不能比格子寬：每一張的右緣都在下一張的左緣之前。
 */
test('1100×800 遴選：席位卡不互相疊', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', '只量桌機');
  await page.setViewportSize({ width: 1100, height: 800 });
  const progress = {
    episode: 'ep2',
    scene: 15,
    step: 0,
    choices: {},
    cards: [],
    flags: [],
    ethics: [],
    scenes: {},
  };
  await page.addInitScript(
    (s) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('lawgame-ep-auto', s);
    },
    JSON.stringify({ version: 5, savedAt: Date.now(), label: 'x', progress }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /^繼續（/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^開始遴選/ }).click();
  const seats = page.locator('.seats').last().locator('.seatc');
  await expect(seats).toHaveCount(6);
  const boxes = await seats.evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return [r.left, r.right];
    }),
  );
  for (let i = 1; i < boxes.length; i++)
    expect(boxes[i][0]).toBeGreaterThanOrEqual(boxes[i - 1][1]);
});
