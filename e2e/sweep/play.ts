/// <reference lib="dom" />
/* QA 試玩腳本：多路線走第 1 集（2026-11-16 從 qa/tests 搬進 repo，全站掃描用）。 */
import { expect, type Page, type Locator } from '@playwright/test';
import { fileMotion, ruling } from './motion';

export type Opts = {
  theory: 'rachel' | 'sophie' | 'doubt';
  rosa?: boolean;
  jade?: boolean; // 打給潔德 → 疑問 7（論點 I） // 派蘿莎拿停車場紀錄 → 疑問 6（論點 H）
  withdrawChat?: boolean; // 惠特洛克施壓時撤回傳票
  mistakes?: boolean; // 故意連錯線、選錯依據
  objections?: 'right' | 'none';
  impeach?: boolean; // 庭上是否出示論點
  bluff?: boolean;
  shots?: string; // 截圖目錄
};

export const log: string[] = [];
let shotN = 0;

export async function shot(page: Page, o: Opts, name: string) {
  const ow = await page.evaluate(() => {
    const d = document.documentElement;
    const bad: string[] = [];
    if (d.scrollWidth > innerWidth + 1) bad.push(`頁面橫向溢出 ${d.scrollWidth}>${innerWidth}`);
    for (const el of Array.from(document.querySelectorAll('button, .pick-name, h1, h2, p, li'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > innerWidth + 1 || r.left < -1))
        bad.push(
          `元素超出畫面: <${el.tagName.toLowerCase()} class="${el.className}"> ${(el.textContent || '').slice(0, 20)}`,
        );
    }
    return bad.slice(0, 5);
  });
  for (const b of ow) log.push(`[版面] ${name}: ${b}`);
  if (o.shots)
    await page.screenshot({ path: `${o.shots}/${String(++shotN).padStart(2, '0')}-${name}.png` });
}

/** #258 起：地點字卡（.place-beat，約 2.9 秒，點一下略過）擋在 UI 前面。 */
export const skipBeat = async (page: Page) => {
  const beat = page.locator('.place-beat').first();
  for (let i = 0; i < 3 && (await beat.isVisible().catch(() => false)); i++) {
    await beat.click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(150);
  }
};

export const next = async (page: Page, name: string | RegExp = '繼續') => {
  await skipBeat(page);
  // #149 起：自動結束的詰問先停在筆錄，多按一次「休庭」。
  const recess = page.getByRole('button', { name: '休庭', exact: true });
  if (name === '繼續' && (await recess.isVisible().catch(() => false))) await recess.click();
  return page
    .getByRole('button', { name, exact: typeof name === 'string' })
    .first()
    .click();
};

export const cardIn = (root: Page | Locator, name: string | RegExp) =>
  root.locator('.pick-name', { hasText: name });

/** 打開某個疑問的工作台（#69 起的三欄證據板；手機版先回清單）。 */
export async function openQ(page: Page, title: string) {
  const back = page.getByRole('button', { name: '← 全部疑問' });
  if (await back.isVisible()) await back.click();
  await page.locator('.q-item', { hasText: title }).click();
  const q = page.locator('section.workbench');
  await expect(q).toContainText(title);
  return q;
}

/** 電腦版的卡片在右邊證據欄；手機版在連線台底下的「挑卡片」。 */
async function pickCard(page: Page, links: Locator, name: string | RegExp) {
  const side = page.locator('.sheet.side');
  if (await side.isVisible())
    return side
      .locator('.card.pickable', { has: page.locator('strong', { hasText: name }) })
      .first()
      .click();
  // #277 起：手機是 4:5 的板子，牌架分頁（.cork-dots）；點牌架上的卡就放進下一個空格。
  const all = page.locator('.cork-rack:not(.marks) .cork-card');
  // #305 起同名卡只顯示冒號後那段，完整卡名在 aria-label（卡自己或裡面的元素）。
  const rack = all.filter({ hasText: name }).or(all.and(page.getByLabel(name)));
  const dots = page.locator('.cork-dots button');
  const nDots = await dots.count();
  for (let i = 0; i < Math.max(nDots, 1); i++) {
    if (i > 0 || (await rack.count()) === 0) if (nDots) await dots.nth(i).click();
    if ((await rack.count()) > 0) return rack.first().click();
  }
  // 找不到：退回舊的挑卡片抽屜
  await links.getByRole('button', { name: '放一張卡' }).first().click();
  await cardIn(page.locator('.card-sheet'), name).first().click();
  await page
    .locator('.card-sheet')
    .waitFor({ state: 'hidden', timeout: 3000 })
    .catch(() => {});
}

export async function link(
  page: Page,
  title: string,
  names: (string | RegExp)[],
  relation: RegExp,
) {
  const q = await openQ(page, title);
  const links = q.locator('section.links');
  // 上一次連錯的卡還留在台上：先拿下來
  while (await links.locator('button.slot-clear').count())
    await links.locator('button.slot-clear').first().click();
  // 每放一張就等它真的上台（A／B 多一個「拿下 …」鈕，Desk.tsx corkSlot）再放下一張：手機牌架換頁時卡還在動，
  // CI 滿載時那一下點空了，兩格沒放滿，「連起來」一直是灰的（2026-11-16 main：R6 手機；#377 E2 手機）。點空了就再點一次。
  const placed = links.getByRole('button', { name: /^拿下 / });
  for (const n of names) {
    const before = await placed.count();
    await pickCard(page, links, n);
    const landed = await expect(placed)
      .toHaveCount(before + 1, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!landed) {
      await pickCard(page, links, n);
      await expect(placed).toHaveCount(before + 1);
    }
  }
  const rel = links.getByRole('radio', { name: relation });
  await rel.click();
  await expect(rel).toBeChecked();
  await links.getByRole('button', { name: '連起來' }).click();
  return links.getByRole('status');
}

export async function answer(page: Page, n: number) {
  const q = page.locator('section.workbench');
  const fb = q.getByRole('button', { name: new RegExp(`^發現 ${n}，`) });
  if (!(await fb.isVisible().catch(() => false)))
    await q
      .locator('details.found-used > summary')
      .click()
      .catch(() => {});
  await fb.click();
  await q.getByRole('button', { name: /^提交/ }).click();
  await expect(q).toContainText('已確認');
}

export async function solve(
  page: Page,
  title: string,
  names: (string | RegExp)[],
  relation: RegExp,
  n: number,
) {
  await expect(await link(page, title, names, relation)).toContainText('連起來了');
  await answer(page, n);
}

export async function until(page: Page, target: Locator, limit = 30) {
  for (let i = 0; i < limit; i++) {
    // #219 起黑條蓋上有 167ms 的 scaleX 動畫：剛出現的第一格寬度是 0，isVisible 會是 false。先等它長出來再判斷。
    if ((await target.count().catch(() => 0)) > 0)
      await target
        .first()
        .waitFor({ state: 'visible', timeout: 1000 })
        .catch(() => {});
    if (
      await target
        .first()
        .isVisible()
        .catch(() => false)
    )
      return;
    const choice = page.getByRole('group', { name: '選擇' });
    if (
      !(await page
        .getByRole('button', { name: '繼續' })
        .first()
        .isVisible()
        .catch(() => false)) &&
      (await choice.isVisible().catch(() => false))
    ) {
      const opts = await choice.getByRole('button').allTextContents();
      log.push(`[途中選項] ${opts.join(' | ')} → 點第一個`);
      await choice.getByRole('button').first().click();
      continue;
    }
    await next(page);
  }
  await expect(target).toBeVisible();
}

export const hours = async (page: Page) => {
  const t = await page
    .getByLabel(/剩餘工時/)
    .first()
    .getAttribute('aria-label');
  return Number(t?.match(/\d+/)?.[0]);
};

export async function readFact(page: Page, doc: RegExp, facts: RegExp[]) {
  await page.getByRole('button', { name: /^卷宗( \d+)?$/ }).click();
  await page.getByRole('button', { name: doc }).click();
  for (const f of facts) await page.getByRole('button', { name: f }).click();
  await page.getByRole('button', { name: '← 卷宗' }).click();
}

export async function delegate(page: Page, label: RegExp) {
  await page.getByRole('button', { name: '委託', exact: true }).click();
  const job = page
    .locator('li:has(> strong)')
    .filter({ has: page.locator('strong', { hasText: label }) });
  await job
    .getByRole('button', { name: /^委託（\d 工時）$/ })
    .first()
    .click();
  await page.getByRole('button', { name: '回到桌面' }).click();
}

export async function play(page: Page, o: Opts) {
  const errors: string[] = [];
  let denied = false;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  await shot(page, o, 'title');
  await page.getByRole('button', { name: '新遊戲' }).click();
  await page.getByRole('button', { name: /^第 1 集/ }).click();
  await next(page);
  await next(page);
  await page.getByRole('button', { name: /^聊天 葛蘭特・沃斯/ }).click();
  await shot(page, o, 'phone');
  await page.getByRole('button', { name: '好。' }).click();
  await next(page);
  await page.getByRole('button', { name: '叫車' }).click();
  await next(page);
  await page.getByRole('button', { name: '嗯，算是吧。' }).click();
  await next(page);
  await next(page);
  await page.getByRole('button', { name: '感應員工證' }).click();
  await page.getByRole('button', { name: '推開門' }).click();
  await until(page, page.getByText('此訊息已被收回'));
  await next(page);
  await next(page);

  await until(page, page.getByRole('button', { name: '慢慢說。從你收到訊息開始。' }));
  await shot(page, o, 'dialogue');
  await page.getByRole('button', { name: '慢慢說。從你收到訊息開始。' }).click();
  await until(page, page.getByRole('button', { name: '星期五下午，沃斯找你做什麼？' }));
  await shot(page, o, 'interview');
  for (const q of [
    '星期五下午，沃斯找你做什麼？',
    '那天晚上你怎麼去公司的？',
    '他傳給你的訊息，還在嗎？',
  ])
    await page.getByRole('button', { name: q }).click();
  await page.getByRole('button', { name: '結束會見' }).click();
  await until(page, page.getByRole('button', { name: /四十小時。那我/ }));
  await page.getByRole('button', { name: /四十小時。那我/ }).click();
  await until(page, page.getByRole('button', { name: /^卷宗( \d+)?$/ }));

  // 第二幕
  await shot(page, o, 'desk');
  await readFact(page, /看守所財物清單/, [/智慧手錶 1 支/]);
  // 瑞秋線順便讀第二幕的逮捕報告，第三幕改用「14:20 供述＋14:32 告知書」回答米蘭達（#74 新接受的組合）。
  if (o.theory === 'rachel') await readFact(page, /^逮捕報告/, [/14:20 押解途中/, /14:32 於分局/]);
  await readFact(page, /警方報告與附件/, [/另有一組員工證於 23:26/, /稱下班後直接回家/]);
  await delegate(page, /叫車公司/);
  await delegate(page, /智慧手錶/);
  await page.getByRole('button', { name: '證據板' }).click();
  await shot(page, o, 'board');
  if (o.mistakes) {
    const h = await hours(page);
    const st = await link(page, '伊森說是沃斯叫他上去的', ['手錶通知紀錄', '叫車收據'], /矛盾/);
    await expect(st).toHaveCount(1);
    log.push(
      `[走錯] 連錯線（關係錯）：bench class=「${await page.locator('.link-bench').getAttribute('class')}」，工時 ${h}→${await hours(page)}`,
    );
    await shot(page, o, 'board-wrong');
    // 錯了之後兩張卡還留在連線台上，只換關係
    const links = page.locator('section.links');
    await links.getByRole('radio', { name: /支持/ }).click();
    await links.getByRole('button', { name: '連起來' }).click();
    await expect(links.getByRole('status')).toContainText('連起來了');
    await answer(page, 1);
  } else
    await solve(
      page,
      '伊森說是沃斯叫他上去的',
      ['手錶通知紀錄', /伊森的說法：訊息被收回/],
      /支持/,
      1,
    );

  await readFact(page, /驗屍報告/, [/死亡時間推估/, /錶帶完好/]);
  await delegate(page, /蘇菲，問沃斯/);
  await page.getByRole('button', { name: '證據板' }).click();
  await solve(
    page,
    '沃斯的手錶死後還戴在身上',
    ['驗屍照片：死者的手錶', '蘇菲陳述：他每天盯著健康 App'],
    /支持/,
    2,
  );

  await page.getByRole('button', { name: '法院系統' }).click();
  await expect(page.locator('article.plead')).toContainText(/手錶/);
  if (o.mistakes) {
    await fileMotion(page, '核發傳票給手錶廠商', '營業秘密', /手錶能縮小死亡時間/);
    await shot(page, o, 'motion-denied');
    const st = await ruling(page);
    log.push(`[走錯] 手錶傳票選錯依據：駁回章${st ? `「${st}」` : '沒有'}出現`);
    const again =
      (await page.getByRole('button', { name: /重新遞狀/ }).count()) +
      (await page.getByText('修正後可重送').count());
    log.push(`[走錯] 駁回後手錶傳票${again ? '可以重送' : '消失了（無法重送）'}`);
    denied = !again;
    if (
      denied &&
      (await page
        .getByRole('button', { name: '回到桌面' })
        .isVisible()
        .catch(() => false))
    ) {
      await page.getByRole('button', { name: '回到桌面' }).click();
      await page.getByRole('button', { name: '法院系統' }).click();
    }
  }
  if (!denied) {
    await fileMotion(page, '核發傳票給手錶廠商', '相關性', /手錶能縮小死亡時間/);
    await expect(page.getByText(/22:24，心率歸零。|23 分鐘/).first()).toBeVisible();
    await page.getByRole('button', { name: '回到桌面' }).click();
    await page.getByRole('button', { name: '法院系統' }).click();
    await page.getByRole('button', { name: /^聲請 2/ }).click();
  }
  {
    const p2 = page.getByRole('button', { name: /^聲請 2/ });
    if (await p2.isVisible().catch(() => false)) await p2.click();
  }
  await fileMotion(page, '核發傳票給卡爾德物流', '相關性', /論點 A/);
  await page.getByRole('button', { name: '回到桌面' }).click();
  await expect(page.getByText('我也知道誰付我們薪水。')).toBeVisible();
  await shot(page, o, 'whitlock');
  await page.getByRole('button', { name: o.withdrawChat ? '撤回傳票。' : '我出庭答辯。' }).click();
  await page.getByRole('button', { name: '回到桌面' }).click();

  await page.getByRole('button', { name: '證據板' }).click();
  if (!denied)
    await solve(page, '驗屍只給了一個範圍', [/驗屍報告$/, '沃斯手錶的心率紀錄'], /縮小範圍/, 3);
  if (!o.withdrawChat && !denied) {
    await solve(
      page,
      '22:31 的訊息從哪台電腦',
      ['聊天系統稽核紀錄', /論點 B：沃斯(死在伊森進門之前| 22:24 死亡)/],
      /矛盾/,
      4,
    );
    await solve(page, '23:14 訊息被收回時', ['聊天系統稽核紀錄', '完整門禁紀錄'], /說明機會/, 5);
  }
  if (o.rosa) {
    await delegate(page, /蘿莎/);
    await page.getByRole('button', { name: '證據板' }).click();
    const n = denied ? 3 : o.withdrawChat ? 4 : 6;
    await solve(page, '蘇菲說她直接回家了', [/停車場(進出)?紀錄/, /蘇菲對警方的說法/], /矛盾/, n);
    if (o.jade) {
      await delegate(page, /潔德/);
      await page.getByRole('button', { name: '證據板' }).click();
      await solve(page, '蘇菲那段時間其實在車上', [/停車場(進出)?紀錄/, /潔德證實/], /支持/, n + 1);
    }
  }
  log.push(`[資訊] 第二幕結束剩餘工時 ${await hours(page)}`);
  await shot(page, o, 'board-done');
  {
    const b = page.getByRole('button', { name: '← 全部疑問' });
    if (await b.isVisible().catch(() => false)) await b.click();
  }
  await page.getByRole('button', { name: '結束調查' }).click();
  await page.getByRole('button', { name: /確定結束/ }).click();
  await expect(page.getByText('先讓他把話說死，再拿出證據。')).toBeVisible();
  await page.getByRole('button', { name: '開庭' }).click();
  await next(page);

  // 第三幕：米蘭達
  await readFact(page, /逮捕報告與巡邏車錄影/, [/逮捕時間 14:05，地點/, /沒有唸出任何權利告知/]);
  await page.getByRole('button', { name: '證據板' }).click();
  if (o.theory === 'rachel')
    await solve(page, '車上那句話', [/警車上的供述/, /權利告知書/], /矛盾/, 1);
  else
    await solve(page, '車上那句話', [/逮捕報告：「自願陳述」/, '巡邏車錄影：沒有警告'], /矛盾/, 1);
  await page.getByRole('button', { name: '法院系統' }).click();
  await fileMotion(page, '排除該項供述', '米蘭達警告', /那句話是警員問出來的/);
  await expect(page.getByText('本庭排除該項供述')).toBeVisible();
  await page.getByRole('button', { name: '回到桌面' }).click();
  {
    const b = page.getByRole('button', { name: '← 全部疑問' });
    if (await b.isVisible().catch(() => false)) await b.click();
  }
  await page.getByRole('button', { name: '結束調查' }).click();
  await page.getByRole('button', { name: /確定結束/ }).click();
  await next(page, '開庭');

  // 證詞錄取
  await page.getByRole('button', { name: '開始錄取' }).click();
  await shot(page, o, 'deposition');
  await page.getByRole('button', { name: /妳說妳聽見隔壁有人倒地/ }).click();
  await page.getByRole('button', { name: '那場會議' }).click();
  await page.getByRole('button', { name: /整晚都在線上會議/ }).click();
  await page.getByRole('button', { name: '結束錄取' }).click();
  await next(page);

  // 協商
  await page.getByRole('button', { name: '坐下' }).click();
  if (o.bluff) {
    await page.getByRole('button', { name: '虛張聲勢' }).click();
    await page.getByRole('button', { name: /證人整晚不在座位上/ }).click();
  }
  await shot(page, o, 'nego');
  if (o.bluff) await page.getByRole('button', { name: '對方開的條件' }).click();
  await page.getByRole('button', { name: '建議撐下去' }).click();
  await page.getByRole('button', { name: '離席' }).click();
  await page.waitForTimeout(150);
  {
    const c = page.locator('.commit-bar button.commit');
    if (await c.isVisible().catch(() => false)) await c.click();
  } // #166
  await expect(page.getByText('那就法庭見')).toBeVisible();
  await next(page);

  // 案件理論
  await page.getByRole('button', { name: '選擇案件理論' }).click();
  await shot(page, o, 'theory');
  const tname = { rachel: '另有其人：瑞秋', sophie: '另有其人：蘇菲', doubt: '合理懷疑' }[o.theory];
  const avail: string[] = [];
  for (const t of ['合理懷疑', '另有其人：蘇菲', '另有其人：瑞秋']) {
    const b = page.locator('button.theory-card', { hasText: t });
    if (await b.isEnabled().catch(() => false)) avail.push(t);
  }
  log.push(`[資訊] 可選理論：${avail.join('、') || '（沒有）'}`);
  const chosen = avail.includes(tname) ? tname : avail[0];
  if (!chosen) {
    log.push('[卡關] 沒有任何案件理論可選');
    const others = await page.locator('main button').allTextContents();
    log.push(`[卡關] 畫面上的按鈕：${others.join(' | ')}`);
    await page.getByRole('button', { name: /直接開庭/ }).click();
  } else {
    if (chosen !== tname) log.push(`[資訊] 想選 ${tname} 但不可選，改選 ${chosen}`);
    await page.locator('button.theory-card', { hasText: chosen }).click();
    await page.getByRole('button', { name: '以這個理論開庭' }).click();
  }
  // #58 起第三幕結尾問伊森要不要作證：瑞秋線答應，其他路線勸他不要。
  const testify = page.getByRole('button', {
    name: o.theory === 'rachel' ? /每天練一遍/ : /我建議你不要/,
  });
  await until(page, testify);
  await testify.click();
  await until(page, page.getByRole('button', { name: '開始遴選' }));

  // 遴選
  await page.getByRole('button', { name: '開始遴選' }).click();
  await shot(page, o, 'voirdire');
  await page.getByRole('button', { name: /就用這 12 位/ }).click();
  await next(page);

  // 開場陳述：把可勾的承諾都勾上
  await shot(page, o, 'before-opening');
  log.push(
    `[資訊] 開場前按鈕：${(await page.locator('main button').allTextContents()).join(' | ')}`,
  );
  await page.getByRole('button', { name: '開始陳述' }).click();
  await shot(page, o, 'opening');
  const promise = page.getByRole('button', { name: /許下 \d+ 個承諾|不許任何承諾/ });
  for (const b of await page.locator('main button').all()) {
    const t = (await b.textContent()) || '';
    if (/你們會/.test(t)) await b.click();
  }
  log.push(`[資訊] 開場陳述按鈕：${await promise.textContent().catch(() => '找不到')}`);
  await promise.click();
  await next(page, '開庭');
  await page.getByRole('button', { name: '開庭' }).click();

  // 柯瓦斯基
  await shot(page, o, 'court-k');
  await direct(page, o, 'k');
  await page.getByRole('button', { name: '開始交互詰問' }).click();
  if (o.impeach) {
    await page.getByRole('button', { name: /「所有」是指所有/ }).click();
    await page.getByRole('button', { name: /智慧手錶會同步手機的通知/ }).click();
    await cardIn(page, /出示 論點 A/).click();
  }
  await page.getByRole('button', { name: '詰問完畢' }).click();
  await shot(page, o, 'k-done');
  await next(page);
  await next(page);

  // 蘇菲
  await page.getByRole('button', { name: '開庭' }).click();
  await direct(page, o, 's');
  await page.getByRole('button', { name: '開始交互詰問' }).click();
  await shot(page, o, 'court-s');
  if (o.rosa && o.impeach) {
    const c = page.locator('article.claim');
    await c.getByRole('button', { name: /沒有繞去任何地方/ }).click();
    await c.getByRole('button', { name: /地下停車場走/ }).click();
    await cardIn(c, /出示 論點 H/).click();
    await shot(page, o, 's-impeached');
  }
  if (
    await page
      .getByRole('button', { name: '詰問完畢' })
      .isVisible()
      .catch(() => false)
  )
    await page.getByRole('button', { name: '詰問完畢' }).click();
  await next(page);

  // 瑞秋
  await page.getByRole('button', { name: '開庭' }).click();
  await direct(page, o, 'r');
  await page.getByRole('button', { name: '開始交互詰問' }).click();
  await shot(page, o, 'court-r');
  if (o.impeach && !o.withdrawChat) {
    const claim = page.locator('article.claim');
    await claim.getByRole('button', { name: /智慧手錶會記錄心率/ }).click();
    await cardIn(claim, /出示 論點 B/).click();
    await claim.getByRole('button', { name: /出席紀錄由系統自動產生/ }).click();
    await cardIn(claim, /出示 論點 C/).click();
    await claim.getByRole('button', { name: /那個時間，三十一樓除了您/ }).click();
    await claim.getByRole('button', { name: /門禁紀錄顯示/ }).click();
    await cardIn(claim, /出示 論點 D/).click();
    if (o.theory === 'rachel') await expect(page.getByText('自證己罪')).toBeVisible();
    else
      log.push(
        `[資訊] 非瑞秋理論彈劾瑞秋：${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(-200)}`,
      );
  } else if (
    await page
      .getByRole('button', { name: '詰問完畢' })
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByRole('button', { name: '詰問完畢' }).click();
  }
  await shot(page, o, 'r-done');
  await next(page);

  // 辯方證人（#58 起有布魯克斯、普莉亞、奧瑪，答應作證的話還有伊森）；瑞秋線可能當庭撤訴，直接跳到尾聲。
  const QS: Record<string, RegExp[]> = {
    '艾倫・布魯克斯': [/死亡時間是週五晚上/, /智慧手錶，您在驗屍/, /心率歸零，代表什麼/],
    '普莉亞・奈爾': [/心率紀錄，可信嗎/, /有沒有地方留下紀錄/, /從哪裡發出、又是從哪裡收回/],
    '奧瑪・哈桑': [/在哪裡載到被告/, /他要去做什麼/, /他一路上在做什麼/],
    '伊森・蕭': [/你收到了什麼/, /看到了什麼/],
  };
  const closingBtn = page.getByRole('button', { name: '訴求基調' });
  const theEnd = page
    .getByRole('heading', { name: /^(本集完|待續|End of episode|To be continued)$/ })
    .or(page.getByRole('button', { name: /^(回標題|Back to title)$/ }))
    .first();
  for (let i = 0; i < 80; i++) {
    if (
      (await closingBtn.isVisible().catch(() => false)) ||
      (await theEnd.isVisible().catch(() => false))
    )
      break;
    const prep = page.getByRole('button', { name: /^準備.+出庭$/ });
    if (await prep.isVisible().catch(() => false)) {
      const who = ((await prep.textContent()) || '').replace(/^準備|出庭$/g, '');
      log.push(`[辯方證人] ${who}`);
      await prep.click();
      await page.getByRole('radio').nth(1).click();
      await page.getByRole('button', { name: /^就這樣準備/ }).click();
      for (const q of QS[who] ?? []) {
        const b = page.getByRole('button', { name: q });
        if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false)))
          await b.click();
        else log.push(`[辯方證人] ${who}：沒有「${q.source}」這題可問`);
      }
      const done = page.getByRole('button', { name: '問完了' });
      await done.click();
      continue;
    }
    const choice = page.getByRole('group', { name: '選擇' });
    if (
      await page
        .getByRole('button', { name: '繼續' })
        .first()
        .isVisible()
        .catch(() => false)
    )
      await next(page);
    else if (await choice.isVisible().catch(() => false)) {
      log.push(
        `[途中選項] ${(await choice.getByRole('button').allTextContents()).join(' | ')} → 點第一個`,
      );
      await choice.getByRole('button').first().click();
    } else break;
  }
  if (await theEnd.isVisible().catch(() => false)) {
    log.push(`[結果] ${o.theory}：沒有進結辯就到本集完（撤訴或認罪結局）`);
    for (const e of errors) log.push(`[主控台錯誤] ${e}`);
    return;
  }
  await expect(closingBtn).toBeVisible();

  // 結辯：有什麼論點就挑前三個
  await shot(page, o, 'closing');
  const args = page.locator('.pick-name', { hasText: /^論點/ });
  const names = (await args.allTextContents()).slice(0, 3);
  for (const nm of names) await cardIn(page, nm).first().click();
  await page.getByRole('button', { name: '訴求基調' }).click();
  await cardIn(page, /程序正義/).click();
  await page.getByRole('button', { name: '開始結辯' }).click();
  const verdict = page.getByRole('heading', {
    name: /無罪|有罪|僵局|無法達成|未達一致|審判無效|未達法定票數/,
  });
  await expect(verdict).toBeVisible({ timeout: 30000 }); // #253 之後判決是 6 秒的四拍（裁決書、黑條頁、字卡、窗光）
  log.push(`[結果] ${o.theory} 判決：${await verdict.textContent()}`);
  await shot(page, o, 'verdict');
  // 判決後一路按繼續，收集尾聲文字
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    const t = (
      (await page
        .locator('main')
        .innerText()
        .catch(() => '')) || ''
    ).replace(/\s+/g, ' ');
    if (t && !seen.includes(t)) seen.push(t);
    const btns = page.locator('main button:visible, button:visible').filter({ hasNotText: /選單/ });
    if (
      await page
        .getByRole('heading', { name: /^(本集完|待續|End of episode|To be continued)$/ })
        .or(page.getByRole('button', { name: /^(回標題|Back to title)$/ }))
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      log.push(`[本集完按鈕] ${(await page.locator('main button').allTextContents()).join(' | ')}`);
      break;
    }
    const c = page.getByRole('button', { name: '繼續', exact: true });
    if (await c.isVisible().catch(() => false)) await c.first().click();
    else if ((await btns.count()) > 0 && i < 39) {
      const label = (await btns.first().textContent()) || '';
      if (/標題|回到|新遊戲/.test(label)) break;
      log.push(`[尾聲選項] ${(await btns.allTextContents()).join(' | ')} → 點第一個`);
      await btns.first().click();
    } else break;
  }
  log.push(`[尾聲] ${seen.map((x) => x.slice(0, 160)).join(' ⏎ ')}`);
  await shot(page, o, 'end');
  for (const e of errors) log.push(`[主控台錯誤] ${e}`);
}

async function direct(page: Page, o: Opts, who: string) {
  for (let i = 0; i < 12; i++) {
    const listen = page.getByRole('button', { name: '聽下一個問題' });
    if (!(await listen.isVisible().catch(() => false))) break;
    await listen.click();
    const objs = page.getByRole('button', { name: /^(誘導|傳聞|推測|無關|重複|爭辯)$/ });
    if (o.objections === 'right' && (await objs.count())) {
      // 只對劇本標了異議的那幾題異議：靠畫面上沒有就不異議
      const t = (await page.locator('main').textContent()) || '';
      const pick = /（這句話/.test(t) ? null : null;
      void pick;
    }
    await page.getByRole('button', { name: '不異議' }).click();
  }
  void who;
}
