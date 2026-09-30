import { expect, test, type Page } from '@playwright/test';

const next = (page: Page, name: string | RegExp = '繼續') =>
  page.getByRole('button', { name }).first().click();

/** 一直按「繼續」直到某個東西出現；對話長度改了測試也不會壞。 */
async function until(page: Page, target: ReturnType<Page['getByRole']>, limit = 30) {
  for (let i = 0; i < limit; i++) {
    if (await target.isVisible().catch(() => false)) return;
    await next(page);
  }
  await expect(target).toBeVisible();
}

/** 自動通關：冷開場 → 第一幕 → 調查 → 庭審，彈劾成功。 */
test('垂直切片可以一路走到彈劾成功', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新遊戲' }).click();

  // 冷開場
  await next(page);
  await next(page);
  await page.getByRole('button', { name: /打開 葛蘭特・沃斯 的訊息/ }).click();
  await page.getByRole('button', { name: '好。' }).click();
  await next(page);
  await page.getByRole('button', { name: '叫車' }).click();
  await next(page);
  await page.getByRole('button', { name: '嗯，算是吧。' }).click();
  await next(page);
  await next(page);
  await page.getByRole('button', { name: '感應員工證' }).click();
  await page.getByRole('button', { name: '推開門' }).click();
  await next(page);
  await next(page);
  await next(page);
  await expect(page.getByText('此訊息已被收回')).toBeVisible();
  await next(page);
  await next(page); // 片頭

  // 第一幕：事務所與看守所來電
  await until(page, page.getByRole('button', { name: '慢慢說。從你收到訊息開始。' }));
  await page.getByRole('button', { name: '慢慢說。從你收到訊息開始。' }).click();
  await until(page, page.getByRole('button', { name: '星期五下午，沃斯找你做什麼？' }));

  // 訪談伊森：關鍵話題問完才能結束
  await expect(page.getByRole('button', { name: '還有關鍵的事沒問' })).toBeDisabled();
  await page.getByRole('button', { name: '星期五下午，沃斯找你做什麼？' }).click();
  await page.getByRole('button', { name: '那天晚上你怎麼去公司的？' }).click();
  await page.getByRole('button', { name: '他傳給你的訊息，還在嗎？' }).click();
  await page.getByRole('button', { name: '結束會見' }).click();

  // 接案
  await until(page, page.getByRole('button', { name: '謝謝。四十小時夠了。' }));
  await page.getByRole('button', { name: '謝謝。四十小時夠了。' }).click();
  await until(page, page.getByRole('button', { name: '卷宗', exact: true }));

  // 第二幕：讀卷宗、標記事實、委託、推理鏈
  await expect(page.getByLabel(/剩餘工時 24/)).toBeVisible();
  await page.getByRole('button', { name: '卷宗', exact: true }).click();
  await page.getByRole('button', { name: /看守所財物清單/ }).click();
  await page.getByRole('button', { name: /智慧手錶 1 支/ }).click();
  await page.getByRole('button', { name: '← 卷宗' }).click();

  await page.getByRole('button', { name: '委託', exact: true }).click();
  await page
    .getByRole('button', { name: /^委託（2 工時）$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '回到桌面' }).click();
  await page.getByRole('button', { name: '委託', exact: true }).click();
  await page
    .getByRole('button', { name: /^委託（2 工時）$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '回到桌面' }).click();
  await expect(page.getByLabel(/剩餘工時 20/)).toBeVisible();

  await page.getByRole('button', { name: '證據板' }).click();
  const chain = page.locator('section.chain').filter({ hasText: '伊森為什麼' });
  await chain.locator('summary').click();
  await chain.getByRole('button', { name: '手錶通知紀錄' }).click();
  await chain.getByRole('button', { name: '叫車收據' }).click();
  await chain.getByRole('radio', { name: /支持/ }).click();
  await chain.getByRole('button', { name: /提交到案情會議/ }).click();
  // 確認過關的推理鏈，這一幕就收尾，海爾在開庭前說出彈劾三步驟的那句話。
  await expect(page.getByText('先讓他把話說死，再拿出證據。')).toBeVisible();
  await page.getByRole('button', { name: '開庭' }).click();
  await next(page); // 第四幕字卡
  await page.getByRole('button', { name: '開庭' }).click(); // 羅根交代異議規則之後開庭

  // 庭審：異議、彈劾三步驟
  await page.getByRole('button', { name: '聽下一個問題' }).click();
  await page.getByRole('button', { name: '不異議' }).click();
  await page.getByRole('button', { name: '聽下一個問題' }).click();
  await page.getByRole('button', { name: '誘導' }).click();
  await expect(page.getByText('（這句話已從陪審團視角刪除）')).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: '聽下一個問題' }).click();
    await page.getByRole('button', { name: '不異議' }).click();
  }
  await page.getByRole('button', { name: '開始交互詰問' }).click();

  await page.getByRole('button', { name: /「所有」是指所有/ }).click();
  await page.getByRole('button', { name: /智慧手錶會同步手機的通知/ }).click();
  await page.getByRole('button', { name: /出示 論點 A/ }).click();
  await expect(page.getByText('那則通知……我沒有看過')).toBeVisible();
  await page.getByRole('button', { name: '詰問完畢' }).click();
  await expect(page.getByText('成功彈劾')).toBeVisible();
});
