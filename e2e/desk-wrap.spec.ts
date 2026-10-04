import { expect, test } from '@playwright/test';

// 結束調查要按兩次；雙擊不能直接穿透到「確定結束」（不能復原）。
test('調查：雙擊「結束調查」只會換成確認鈕，不會直接結束', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const desk = {
      hours: 20,
      timeline: [],
      spent: 4,
      marked: [],
      readDocs: [],
      jobs: [],
      mail: [],
      openMail: [],
      link: { cards: [], relation: null },
      found: [],
      badLinks: 0,
      linkNote: null,
      attempts: {},
      confirmed: ['q1'],
      submissions: 1,
      wrong: 0,
      report: [],
      feedback: {},
      motions: {},
      flags: [],
      wrapped: false,
    };
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: '第 1 集・調查',
        progress: {
          episode: 'ep1',
          scene: 7,
          step: 0,
          choices: {},
          cards: [],
          flags: [],
          ethics: [],
          scenes: { investigate: desk },
        },
      }),
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^繼續（/ }).click();

  await page.getByRole('button', { name: '結束調查' }).dblclick();
  await expect(page.getByRole('button', { name: /確定結束/ })).toBeVisible();
  await expect(page.getByText('工時').first()).toBeVisible();
});
