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
  // 過關的推理鏈確認了，但要玩家自己收工，剩下的工時還能查。
  await expect(page.getByRole('button', { name: '結束調查' })).toBeVisible();

  // 第二幕後半：先把手錶相關性鏈確認起來，才提得出傳票聲請。
  await page.getByRole('button', { name: '卷宗', exact: true }).click();
  await page.getByRole('button', { name: /驗屍報告/ }).click();
  await page.getByRole('button', { name: /死亡時間推估/ }).click();
  await page.getByRole('button', { name: /錶帶完好/ }).click();
  await page.getByRole('button', { name: '← 卷宗' }).click();
  await page.getByRole('button', { name: '證據板' }).click();
  const watchChain = page.locator('section.chain').filter({ hasText: '手錶能告訴我們什麼' });
  await watchChain.locator('summary').click();
  await watchChain.getByRole('button', { name: '驗屍照片：死者的手錶' }).click();
  await watchChain.getByRole('button', { name: '驗屍報告', exact: true }).click();
  await watchChain.getByRole('radio', { name: /支持/ }).click();
  await watchChain.getByRole('button', { name: /提交到案情會議/ }).click();

  // 法院系統：依據、支撐、請求三樣都要對。
  await page.getByRole('button', { name: '法院系統' }).click();
  const watchMotion = page.locator('li.job').filter({ hasText: '死者手錶的健康資料' });
  await watchMotion.getByRole('radio', { name: '相關性' }).click();
  await watchMotion.getByRole('button', { name: /手錶資料與本案相關/ }).click();
  await watchMotion.getByRole('radio', { name: '核發傳票給手錶廠商' }).click();
  await watchMotion.getByRole('button', { name: /送出/ }).click();
  await expect(page.getByText('22:24，心率歸零。')).toBeVisible();
  await page.getByRole('button', { name: '回到桌面' }).click();

  // 聊天稽核紀錄的傳票：核准之後對方聲請撤銷，惠特洛克要她收手。
  await page.getByRole('button', { name: '法院系統' }).click();
  const chatMotion = page.locator('li.job').filter({ hasText: '稽核紀錄' });
  await chatMotion.getByRole('radio', { name: '相關性' }).click();
  await chatMotion.getByRole('button', { name: /論點 A/ }).click();
  await chatMotion.getByRole('radio', { name: '核發傳票給卡爾德物流' }).click();
  await chatMotion.getByRole('button', { name: /送出/ }).click();
  await page.getByRole('button', { name: '回到桌面' }).click();
  await expect(page.getByText('我也知道誰付我們薪水。')).toBeVisible();
  await page.getByRole('button', { name: '我出庭答辯。' }).click();
  await expect(page.getByText('法官維持傳票')).toBeVisible();
  await page.getByRole('button', { name: '回到桌面' }).click();

  // 收工，海爾在開庭前說出彈劾三步驟的那句話。
  await page.getByRole('button', { name: '結束調查' }).click();
  await expect(page.getByText('先讓他把話說死，再拿出證據。')).toBeVisible();
  await page.getByRole('button', { name: '開庭' }).click();
  await next(page); // 第三幕字卡

  // 第三幕之一：米蘭達動議
  await page.getByRole('button', { name: '卷宗', exact: true }).click();
  await page.getByRole('button', { name: /逮捕報告與巡邏車錄影/ }).click();
  await page.getByRole('button', { name: /逮捕時間 03:40/ }).click();
  await page.getByRole('button', { name: /沒有唸出任何權利告知/ }).click();
  await page.getByRole('button', { name: '← 卷宗' }).click();
  await page.getByRole('button', { name: '證據板' }).click();
  const miranda = page.locator('section.chain').filter({ hasText: '車上那句話' });
  await miranda.locator('summary').click();
  await miranda.getByRole('button', { name: '逮捕報告', exact: true }).click();
  await miranda.getByRole('button', { name: '巡邏車錄影：沒有警告' }).click();
  await miranda.getByRole('radio', { name: /矛盾/ }).click();
  await miranda.getByRole('button', { name: /提交到案情會議/ }).click();
  await page.getByRole('button', { name: '法院系統' }).click();
  const mm = page.locator('li.job').filter({ hasText: '巡邏車上的供述' });
  await mm.getByRole('radio', { name: '米蘭達警告' }).click();
  await mm.getByRole('button', { name: /供述取得程序違法/ }).click();
  await mm.getByRole('radio', { name: '排除該項供述' }).click();
  await mm.getByRole('button', { name: /送出/ }).click();
  await expect(page.getByText('本庭排除該項供述')).toBeVisible();
  await page.getByRole('button', { name: '回到桌面' }).click();
  await page.getByRole('button', { name: '結束調查' }).click();
  await next(page, '開庭');

  // 第三幕之二：證詞錄取。無害的問題定錨，底牌話題留著不問。
  await page.getByRole('button', { name: '開始錄取' }).click();
  await page.getByRole('button', { name: /妳說妳聽見隔壁有人倒地/ }).click();
  await page.getByRole('button', { name: '那場會議' }).click();
  await page.getByRole('button', { name: /整晚都在線上會議/ }).click();
  await page.getByRole('button', { name: '結束錄取' }).click();
  await expect(page.getByText('宣誓下定錨的說法')).toBeVisible();
  await next(page);

  // 第三幕之三：認罪協商。虛張聲勢被識破，攤牌，最後建議伊森撐下去。
  await page.getByRole('button', { name: '坐下' }).click();
  await expect(page.getByText('二級謀殺，十五年').first()).toBeVisible();
  await page.getByRole('button', { name: /證明妳的證人整晚不在座位上/ }).click();
  await expect(page.getByText('妳在虛張聲勢')).toBeVisible();
  await page.getByRole('button', { name: /亮出 論點 A/ }).click();
  await page.getByRole('button', { name: '建議他撐下去' }).click();
  await page.getByRole('button', { name: '離席' }).click();
  await expect(page.getByText('那就法庭見')).toBeVisible();
  await next(page);

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
  // 談判裡攤牌過的論點，庭上會標成已洩漏，衝擊減半。
  await expect(page.getByRole('button', { name: /出示 論點 A.*已洩漏/ })).toBeVisible();
  await page.getByRole('button', { name: /出示 論點 A/ }).click();
  await expect(page.getByText('那則通知……我沒有看過')).toBeVisible();
  await page.getByRole('button', { name: '詰問完畢' }).click();
  await expect(page.getByText('成功彈劾')).toBeVisible();
});
