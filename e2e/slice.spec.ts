import { expect, test, type Page } from '@playwright/test';

// 整集通關一次就接近 30 秒，CI 機器較慢。
test.describe.configure({ timeout: 90_000 });

const next = (page: Page, name: string | RegExp = '繼續') =>
  page.getByRole('button', { name }).first().click();

/**
 * 卡片按鈕只比對第一行的名字。
 * 按鈕上還印著卡片內容（就是為了不必切分頁去對照），
 * 那段文字裡可能剛好出現別張卡的名字，所以不能整顆按鈕一起比。
 */
const card = (root: Page | ReturnType<Page['locator']>, name: string | RegExp) =>
  root.locator('.pick-name', { hasText: name });

/** 推理兩步：在疑問的工作台上，先用連線台把兩張卡連成發現，再拿第 n 條發現回答。 */
async function solve(
  page: Page,
  _tab: string,
  title: string,
  names: (string | RegExp)[],
  relation: RegExp,
  n: number,
) {
  await toList(page);
  await page.locator('.q-item', { hasText: title }).click();
  const q = page.locator('section.workbench');
  await expect(q).toContainText(title);
  const links = q.locator('section.links');
  // 電腦版的卡片在右邊證據欄，點了直接放上連線台；手機版點連線台的空格打開挑卡片抽屜。
  const side = page.locator('.sheet.side');
  const wide = await side.isVisible();
  for (const name of names) {
    if (wide)
      await side
        .locator('.card.pickable', { has: page.locator('strong', { hasText: name }) })
        .first()
        .click();
    else {
      // 手機：點連線台的空格打開挑卡片抽屜，點一張就放上去。
      await links.getByRole('button', { name: '放一張卡' }).first().click();
      await card(page.locator('.card-sheet'), name).click();
    }
  }
  await links.getByRole('radio', { name: relation }).click();
  await links.getByRole('button', { name: '連起來' }).click();
  await expect(links.getByRole('status')).toContainText('連起來了');
  await q.getByRole('button', { name: new RegExp(`^發現 ${n}：`) }).click();
  await q.getByRole('button', { name: /^提交/ }).click();
  await expect(q).toContainText('已確認');
}

/** 手機版一次一欄：工作台開著就先回到疑問清單（工作台裡答案列取代底列，「結束調查」在清單頁）。 */
async function toList(page: Page) {
  const back = page.getByRole('button', { name: '← 全部疑問' });
  if (await back.isVisible()) await back.click();
}

/** 一直按「繼續」直到某個東西出現；對話長度改了測試也不會壞。 */
async function until(page: Page, target: ReturnType<Page['getByRole']>, limit = 30) {
  for (let i = 0; i < limit; i++) {
    if (await target.isVisible().catch(() => false)) return;
    await next(page);
  }
  await expect(target).toBeVisible();
}

/** 自動通關：冷開場 → 第一幕 → 調查 → 庭審，玩到瑞秋的第三項證詞（論點 D）為止。 */
async function playToRachelLast(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '新遊戲' }).click();
  await page.getByRole('button', { name: /^第 1 集/ }).click();

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
  await until(page, page.getByRole('button', { name: '四十小時。那我把午餐省下來。' }));
  await page.getByRole('button', { name: '四十小時。那我把午餐省下來。' }).click();
  await until(page, page.getByRole('button', { name: /^卷宗( \d+)?$/ }));

  // 第二幕：讀卷宗、標記事實、委託、推理鏈
  await expect(page.getByLabel(/剩餘工時 24/)).toBeVisible();
  await page.getByRole('button', { name: /^卷宗( \d+)?$/ }).click();
  await page.getByRole('button', { name: /看守所財物清單/ }).click();
  await page.getByRole('button', { name: /智慧手錶 1 支/ }).click();
  await page.getByRole('button', { name: '← 卷宗' }).click();
  await page.getByRole('button', { name: /警方報告與附件/ }).click();
  await page.getByRole('button', { name: /另有一組員工證於 23:26/ }).click();
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
  await solve(page, '疑問 1', '沃斯叫他上去的', ['手錶通知紀錄', '叫車收據'], /支持/, 1);
  // 過關的推理鏈確認了，但要玩家自己收工，剩下的工時還能查。
  await toList(page);
  await expect(page.getByRole('button', { name: '結束調查' })).toBeVisible();

  // 第二幕後半：先把手錶相關性鏈確認起來，才提得出傳票聲請。
  await page.getByRole('button', { name: /^卷宗( \d+)?$/ }).click();
  await page.getByRole('button', { name: /驗屍報告/ }).click();
  await page.getByRole('button', { name: /死亡時間推估/ }).click();
  await page.getByRole('button', { name: /錶帶完好/ }).click();
  await page.getByRole('button', { name: '← 卷宗' }).click();
  await page.getByRole('button', { name: '委託', exact: true }).click();
  await page
    .getByRole('button', { name: /^委託（1 工時）$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '回到桌面' }).click();
  await page.getByRole('button', { name: '證據板' }).click();
  await solve(
    page,
    '疑問 2',
    '它平常記錄什麼',
    ['驗屍照片：死者的手錶', '蘇菲陳述：他每天盯著健康 App'],
    /支持/,
    2,
  );

  // 法院系統：依據、支撐、請求三樣都要對。
  await page.getByRole('button', { name: '法院系統' }).click();
  const watchMotion = page.locator('section.job');
  await expect(watchMotion).toContainText('死者手錶的健康資料');
  await watchMotion.getByRole('radio', { name: '相關性' }).click();
  await card(watchMotion, /手錶資料與本案相關/).click();
  await watchMotion.getByRole('radio', { name: '核發傳票給手錶廠商' }).click();
  await watchMotion.getByRole('button', { name: /送出/ }).click();
  await expect(page.getByText(/22:24，心率歸零。|23 分鐘/).first()).toBeVisible();
  await page.getByRole('button', { name: '回到桌面' }).click();

  // 聊天稽核紀錄的傳票：核准之後對方聲請撤銷，惠特洛克要她收手。
  await page.getByRole('button', { name: '法院系統' }).click();
  await page.getByRole('button', { name: '聲請 2' }).click();
  const chatMotion = page.locator('section.job');
  await expect(chatMotion).toContainText('稽核紀錄');
  await chatMotion.getByRole('radio', { name: '相關性' }).click();
  await card(chatMotion, /論點 A/).click();
  await chatMotion.getByRole('radio', { name: '核發傳票給卡爾德物流' }).click();
  await chatMotion.getByRole('button', { name: /送出/ }).click();
  await page.getByRole('button', { name: '回到桌面' }).click();
  await expect(page.getByText('我也知道誰付我們薪水。')).toBeVisible();
  await page.getByRole('button', { name: '我出庭答辯。' }).click();
  await expect(page.getByText('法官維持傳票')).toBeVisible();
  await page.getByRole('button', { name: '回到桌面' }).click();

  // 拿到心率與稽核紀錄之後，把論點 B、C、D 也拼起來。
  await page.getByRole('button', { name: '證據板' }).click();
  const chains: [string, string, (string | RegExp)[], RegExp][] = [
    ['疑問 3', '把死亡時間釘得更準', [/驗屍報告$/, '沃斯手錶的心率紀錄'], /縮小範圍/],
    ['疑問 4', '沃斯還能打字嗎', ['聊天系統稽核紀錄', '論點 B：沃斯 22:24 死亡'], /矛盾/],
    ['疑問 5', '誰還刷卡留在 31 樓', ['聊天系統稽核紀錄', '完整門禁紀錄'], /說明機會/],
  ];
  let n = 3;
  for (const [tab, title, names, relation] of chains)
    await solve(page, tab, title, names, relation, n++);

  // 收工，海爾在開庭前說出彈劾三步驟的那句話。
  await toList(page);
  await page.getByRole('button', { name: '結束調查' }).click();
  await page.getByRole('button', { name: /^確定結束/ }).click();
  await expect(page.getByText('先讓他把話說死，再拿出證據。')).toBeVisible();
  await page.getByRole('button', { name: '開庭' }).click();
  await next(page); // 第三幕字卡

  // 第三幕之一：米蘭達動議
  await page.getByRole('button', { name: /^卷宗( \d+)?$/ }).click();
  await page.getByRole('button', { name: /逮捕報告與巡邏車錄影/ }).click();
  await page.getByRole('button', { name: /逮捕時間 14:05，地點/ }).click();
  await page.getByRole('button', { name: /沒有唸出任何權利告知/ }).click();
  await page.getByRole('button', { name: '← 卷宗' }).click();
  await page.getByRole('button', { name: '證據板' }).click();
  await solve(
    page,
    '疑問 1',
    '車上那句話',
    [/逮捕報告：「自願陳述」/, '巡邏車錄影：沒有警告'],
    /矛盾/,
    1,
  );
  await page.getByRole('button', { name: '法院系統' }).click();
  const mm = page.locator('section.job');
  await expect(mm).toContainText('巡邏車上的供述');
  await mm.getByRole('radio', { name: '米蘭達警告' }).click();
  await card(mm, /供述取得程序違法/).click();
  await mm.getByRole('radio', { name: '排除該項供述' }).click();
  await mm.getByRole('button', { name: /送出/ }).click();
  await expect(page.getByText('本庭排除該項供述')).toBeVisible();
  await page.getByRole('button', { name: '回到桌面' }).click();
  await page.getByRole('button', { name: '結束調查' }).click();
  await page.getByRole('button', { name: /^確定結束/ }).click();
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
  // 條件、攤牌、虛張聲勢各是一個分頁，筆錄留在上面不會被換掉。
  await page.getByRole('button', { name: '虛張聲勢' }).click();
  await page.getByRole('button', { name: /證明你的證人整晚不在座位上/ }).click();
  await expect(page.getByText('你在虛張聲勢')).toBeVisible();
  await page.getByRole('button', { name: '攤牌' }).click();
  await card(page, /亮出 論點 A/).click();
  await page.getByRole('button', { name: '她開的條件' }).click();
  await page.getByRole('button', { name: '建議撐下去' }).click();
  await page.getByRole('button', { name: '離席' }).click();
  await expect(page.getByText('那就法庭見')).toBeVisible();
  await next(page);

  // 第三幕收尾：選案件理論。四條論點都確認了，選難的那條。
  await page.getByRole('button', { name: '選擇案件理論' }).click();
  // 點卡片只是選中，底部定案列的按鈕才真的選定。
  await page.locator('button.theory-card', { hasText: '另有其人：瑞秋' }).click();
  await page.getByRole('button', { name: '以這個理論開庭' }).click();
  await next(page);

  // 伊森想作證。答應他，第三天辯方舉證時他會上證人席。
  const testify = page.getByRole('button', { name: /每天練一遍最難聽的問題/ });
  await until(page, testify);
  await testify.click();
  await next(page);

  await next(page); // 第四幕字卡

  // 陪審團遴選：問出偏見、有因迴避、無因迴避，再入席
  await page.getByRole('button', { name: '開始遴選' }).click();
  // 候選人收成一行一位，點開才有那三顆按鈕。
  const fired = page.locator('li.candidate').filter({ hasText: '唐娜・麥克雷' });
  await fired.getByRole('button', { name: /唐娜・麥克雷/ }).click();
  await fired.getByRole('button', { name: '提問' }).click();
  await expect(page.getByText('他們裁了我')).toBeVisible();
  await fired.getByRole('button', { name: '聲請有因迴避' }).click();
  await expect(page.locator('li.candidate').filter({ hasText: '唐娜・麥克雷' })).toHaveCount(0);
  const walter = page.locator('li.candidate').filter({ hasText: '華特・班奈特' });
  await walter.getByRole('button', { name: /華特・班奈特/ }).click();
  await walter.getByRole('button', { name: '無因迴避' }).click();
  await page.getByRole('button', { name: /就用這 12 位/ }).click();
  await expect(page.getByText('陪審長')).toBeVisible();
  await next(page);

  // 開場陳述：許三個承諾，庭上要一個一個兌現。
  await page.getByRole('button', { name: '開始陳述' }).click();
  for (const t of [/死了/, /誰傳的/, /只剩下一個人/])
    await page.getByRole('button', { name: t }).click();
  await page.getByRole('button', { name: /許下 3 個承諾/ }).click();
  await next(page, '開庭');

  await page.getByRole('button', { name: '開庭' }).click(); // 羅根交代異議規則之後開庭
  // 上場的是遴選留下的人，不是劇本裡的預設陪審團。
  await expect(page.getByRole('list', { name: '陪審團' }).getByText('華特・班奈特')).toHaveCount(0);

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
  // 談判裡攤牌過的論點，庭上會標成已洩漏：對方備好了反擊。
  await expect(card(page, /出示 論點 A.*已洩漏/)).toBeVisible();
  await card(page, /出示 論點 A/).click();
  await expect(page.getByText('那則通知……我沒有看過')).toBeVisible();
  await page.getByRole('button', { name: '詰問完畢' }).click();
  await expect(page.getByText('成功彈劾')).toBeVisible();
  await next(page);
  await next(page); // 第二天字卡

  // 庭審第二天上午：蘇菲。這條線沒走的話，直詰聽完就結束。
  await page.getByRole('button', { name: '開庭' }).click();
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: '聽下一個問題' }).click();
    await page.getByRole('button', { name: '不異議' }).click();
  }
  await page.getByRole('button', { name: '開始交互詰問' }).click();
  await page.getByRole('button', { name: '詰問完畢' }).click();
  await next(page);

  // 庭審第二天：瑞秋。錄取時定錨過的說法，這裡不必再鎖一次。
  await page.getByRole('button', { name: '開庭' }).click();
  for (let i = 0; i < 7; i++) {
    await page.getByRole('button', { name: '聽下一個問題' }).click();
    await page.getByRole('button', { name: '不異議' }).click();
  }
  await page.getByRole('button', { name: '開始交互詰問' }).click();

  // 一次只處理一項證詞，打完會自動換到下一項。
  const claim = page.locator('article.claim');
  await expect(claim).toContainText('十點五十分聽見');
  // 錄取時定錨過的說法，鎖定那一步已經是完成狀態。
  await expect(claim.locator('li.done').first()).toBeVisible();
  await claim.getByRole('button', { name: /智慧手錶會記錄心率/ }).click();
  await card(claim, /出示 論點 B/).click();

  await expect(claim).toContainText('全程在線上會議');
  await claim.getByRole('button', { name: /出席紀錄由系統自動產生/ }).click();
  await card(claim, /出示 論點 C/).click();

  await expect(claim).toContainText('三十一樓還有誰');
  await claim.getByRole('button', { name: /那個時間，三十一樓除了您/ }).click();
  await claim.getByRole('button', { name: /門禁紀錄顯示/ }).click();
  return claim;
}

/** 畫外字幕蓋住整個畫面：一出現就點掉（出字中點一下出完，再點一下前進，多拍就多點幾次）。 */
test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(page.locator('.vo'), async () => {
    for (let k = 0; k < 12 && (await page.locator('.vo').count()); k++) {
      await page.locator('.vo-hit').click({ force: true });
      await page.waitForTimeout(700);
    }
  });
});

test('第 1 集可以一路從冷開場玩到判決', async ({ page }) => {
  await playToRachelLast(page);
  // 不出示論點 D：瑞秋不會援引緘默權，照常走到辯方證人和結辯。
  await page.getByRole('button', { name: '詰問完畢' }).click();
  await next(page);

  await next(page); // 第三天字卡

  // 辯方證人：正常準備，照時間順序問三題，檢方反詰問後收尾。
  await page.getByRole('button', { name: /準備艾倫・布魯克斯出庭/ }).click();
  await page.getByRole('button', { name: '就這樣準備' }).nth(1).click();
  for (const q of [/死亡時間是週五晚上/, /智慧手錶，您在驗屍/, /心率歸零，代表什麼/]) {
    await page.getByRole('button', { name: q }).click();
  }
  await page.getByRole('button', { name: '問完了' }).click();
  await next(page);

  // 其他辯方證人：普莉亞、奧瑪，以及答應過要作證的伊森。
  for (const [who, qs] of [
    ['普莉亞・奈爾', [/心率紀錄，可信嗎/, /有沒有地方留下紀錄/, /從哪裡發出、又是從哪裡收回/]],
    ['奧瑪・哈桑', [/在哪裡載到被告/, /他要去做什麼/, /他一路上在做什麼/]],
    ['伊森・蕭', [/你收到了什麼/, /看到了什麼/]],
  ] as const) {
    await page.getByRole('button', { name: new RegExp(`準備${who}出庭`) }).click();
    await page.getByRole('button', { name: '就這樣準備' }).nth(1).click();
    for (const q of qs) await page.getByRole('button', { name: q }).click();
    await page.getByRole('button', { name: '問完了' }).click();
    await next(page);
  }

  // 結辯：挑三個論點排順序、選基調，然後是三輪評議與判決。
  await card(page, /論點 A/)
    .first()
    .click();
  await card(page, /論點 D/)
    .first()
    .click();
  await card(page, /論點 B/)
    .first()
    .click();
  // 已挑的順序列在下面，最後一個講的會標出近因效應。
  await expect(page.locator('ol.picked')).toContainText('3. 論點 B');
  await page.getByRole('button', { name: '訴求基調' }).click();
  await card(page, /程序正義/).click();
  await page.getByRole('button', { name: '開始結辯' }).click();
  await expect(page.getByText('第 1 輪評議')).toBeVisible();
  await expect(page.getByRole('heading', { name: /無罪|有罪|陪審團僵局/ })).toBeVisible();
});

test('瑞秋援引緘默權後，檢方撤回起訴，直接進尾聲（E1）', async ({ page }) => {
  const claim = await playToRachelLast(page);
  await card(claim, /出示 論點 D/).click();
  await expect(page.getByText('自證己罪')).toBeVisible();
  await next(page);
  await until(page, page.getByText('下次，早點打給我。'));
  // 沒走蘿莎的停車場線，不知道潔德是誰：信封不能交給她。
  const keep = page.getByRole('button', { name: /自己保留/ });
  await until(page, keep);
  await expect(page.getByRole('button', { name: /交給潔德/ })).toHaveCount(0);
  await keep.click();
  await until(page, page.getByText('第 1 集到此結束。'));
});
