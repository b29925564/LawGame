/// <reference lib="dom" />
import { bibleViolations } from './bible';
/* 第 2 集完整路線（2026-11-16 從 qa/tests 搬進 repo，全站掃描用）。 */
import { installLineCheck, lineResult } from './linecheck';
import { installExtra, extraShot } from './extra';
import { expect as expectLines, test, expect, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { link, answer, readFact, delegate, hours, skipBeat } from './play';
import { fileMotion } from './motion';
import { at, tick } from './r225';

type R = {
  disc: ('交出' | '主張特權' | '範圍過廣')[];
  daubert: boolean;
  mediation: 'take' | 'walk' | 'low';
  theory: '他自己的選擇' | '公司已盡告知義務' | '責任該分攤';
  coach: boolean;
  /** 不異議、不對質：故意打爛，看有責與懲罰性賠償結局。 */
  sloppy?: boolean;
  /** #160：審前請崔佛更正筆錄（job-errata）。 */
  errata?: boolean;
  /** 不更正，也不在直接詰問問 tq-always（灰色路線）。 */
  skipAlways?: boolean;
};
const ROUTES: Record<string, R> = {
  'E1 調解：攤牌一次就接受': {
    disc: ['交出', '範圍過廣', '交出', '交出', '主張特權'],
    daubert: true,
    mediation: 'take',
    theory: '他自己的選擇',
    coach: false,
  },
  'E2 調解：虛張＋全部攤牌，壓到最低': {
    disc: ['交出', '範圍過廣', '交出', '交出', '主張特權'],
    daubert: true,
    mediation: 'low',
    theory: '他自己的選擇',
    coach: false,
  },
  'E3 破裂＋他自己的選擇＋排除費雪': {
    disc: ['交出', '範圍過廣', '交出', '交出', '主張特權'],
    daubert: true,
    mediation: 'walk',
    theory: '他自己的選擇',
    coach: false,
  },
  'E4 破裂＋告知義務＋輔導崔佛': {
    disc: ['交出', '交出', '主張特權', '交出', '主張特權'],
    daubert: false,
    mediation: 'walk',
    theory: '公司已盡告知義務',
    coach: true,
  },
  'E8 破裂＋告知義務＋不輔導': {
    disc: ['交出', '交出', '主張特權', '交出', '主張特權'],
    daubert: false,
    mediation: 'walk',
    theory: '公司已盡告知義務',
    coach: false,
  },
  'E9 破裂＋分攤＋全交出＋好好打': {
    disc: ['交出', '範圍過廣', '交出', '交出', '主張特權'],
    daubert: true,
    mediation: 'walk',
    theory: '責任該分攤',
    coach: false,
  },
  'E10 破裂＋告知義務＋更正筆錄＋交出意見書': {
    disc: ['交出', '範圍過廣', '交出', '交出', '交出'],
    daubert: true,
    mediation: 'walk',
    theory: '公司已盡告知義務',
    coach: false,
    errata: true,
  },
  'E11 破裂＋他自己的選擇＋更正筆錄': {
    disc: ['交出', '範圍過廣', '交出', '交出', '主張特權'],
    daubert: false,
    mediation: 'walk',
    theory: '他自己的選擇',
    coach: false,
    errata: true,
  },
  'E5 破裂＋分攤＋硬藏截圖': {
    disc: ['交出', '範圍過廣', '交出', '主張特權', '主張特權'],
    daubert: false,
    mediation: 'walk',
    theory: '責任該分攤',
    coach: false,
  },
  'E7 破裂＋分攤＋全交出＋不異議不對質': {
    disc: ['交出', '範圍過廣', '交出', '交出', '主張特權'],
    daubert: false,
    mediation: 'walk',
    theory: '責任該分攤',
    coach: false,
    sloppy: true,
  },
  'E6 破裂＋分攤＋藏截圖＋輔導＋不異議不對質': {
    disc: ['交出', '範圍過廣', '交出', '主張特權', '主張特權'],
    daubert: false,
    mediation: 'walk',
    theory: '責任該分攤',
    coach: true,
    sloppy: true,
  },
};

if (process.env.MATRIX) {
  for (const k of Object.keys(ROUTES)) delete ROUTES[k];
  for (const theory of ['他自己的選擇', '公司已盡告知義務', '責任該分攤'] as const)
    for (const daubert of [true, false])
      for (const [coach, errata, skipAlways] of [
        [false, false, false],
        [false, true, false],
        [true, false, false],
        [false, false, true],
      ] as const)
        ROUTES[
          `M ${theory}${daubert ? '＋Daubert' : '＋不聲請'}${coach ? '＋輔導' : ''}${errata ? '＋更正' : ''}${skipAlways ? '＋不更正不問' : ''}`
        ] = {
          disc: ['交出', '範圍過廣', '交出', '交出', '主張特權'],
          daubert,
          mediation: 'walk',
          theory,
          coach,
          errata,
          skipAlways,
        };
}
const L: string[] = [];
let PREFER: RegExp[] = [];
let n = 0;
const main = async (page: Page) =>
  (
    (await page
      .locator('main')
      .innerText()
      .catch(() => '')) || ''
  ).replace(/\s+/g, ' ');
const vis = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' }).first();
async function click(page: Page, name: string | RegExp) {
  await vis(page, name).click();
}
async function has(page: Page, name: string | RegExp) {
  return vis(page, name)
    .isVisible()
    .catch(() => false);
}

/** 一直按「繼續」或唯一的按鈕，直到 stop 成立。 */
async function until(
  page: Page,
  stop: () => Promise<boolean>,
  dir: string,
  label: string,
  limit = 260,
) {
  let empties = 0;
  for (let i = 0; i < limit; i++) {
    await skipBeat(page);
    if (process.env.DBGU)
      console.log(
        'U',
        i,
        empties,
        Date.now() % 1000000,
        (
          await page
            .locator('body')
            .innerText()
            .catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 60),
        '| main按鈕',
        await page.locator('main button:visible').count(),
      );
    if (process.env.SLATE_PROBE && (await page.locator('.place-slate').count())) {
      // 地點字卡淡出交叉淡化探針：每 100ms 記字卡不透明度與主按鈕底色
      const rows: string[] = [];
      for (let k = 0; k < 34; k++) {
        rows.push(
          await page.evaluate(() => {
            const sl = document.querySelector('.place-slate');
            const pb = document.querySelector('button.primary');
            return `${sl ? Number(getComputedStyle(sl).opacity).toFixed(2) : 'gone'} | ${pb ? getComputedStyle(pb).backgroundColor : '-'}`;
          }),
        );
        await page.waitForTimeout(100);
      }
      L.push(`[字卡探針]\n  ${rows.join('\n  ')}`);
    }
    await page
      .locator('.act-stage:not(:has(.act-actions))')
      .waitFor({ state: 'detached', timeout: 12000 })
      .catch(() => {});
    await tick(page);
    if (await stop()) return;
    if (await has(page, '繼續')) {
      await click(page, '繼續');
      continue;
    }
    const btns = page.locator('main button:visible');
    if ((await btns.count()) === 1) {
      L.push(`  [唯一按鈕] ${((await btns.textContent()) || '').slice(0, 30)}`);
      await btns.click();
      continue;
    }
    let picked = false;
    for (const rx of PREFER)
      if (await has(page, rx)) {
        L.push(`  [挑] ${rx.source}`);
        await click(page, rx);
        picked = true;
        break;
      }
    if (picked) continue;
    const choice = page.getByRole('group', { name: '選擇' });
    if (await choice.isVisible().catch(() => false)) {
      const opts = await choice.getByRole('button').allTextContents();
      L.push(`  [選項] ${opts.join(' | ')} → 第一個`);
      await choice.getByRole('button').first().click();
      continue;
    }
    // #335 插入鏡頭（硬切 0.4 秒、期間沒有按鈕）：等它演完再找按鈕，不當成卡住。
    if ((await page.locator('main button:visible').count()) === 0 && empties++ < 160) {
      await page.waitForTimeout(500);
      continue;
    }
    break;
  }
  if (!(await stop())) {
    L.push(
      `[停住@${label}] ${(await main(page)).slice(-300)}｜按鈕：${(await page.locator('main button:visible').allTextContents()).join(' | ')}`,
    );
    await page.screenshot({ path: `${dir}/stuck-${label}.png` });
    throw new Error(`停住：${label}`);
  }
}

async function play2(page: Page, r: R, dir: string) {
  const shot = async (s: string) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/${String(++n).padStart(2, '0')}-${s}.png` });
    await extraShot(
      page,
      `${String(n).padStart(2, '0')}-${s}`,
      dir,
      `第2集 ${r.theory}${r.mediation}`,
    );
    await at(page, s);
  };
  PREFER = [/略過$/, /我會先看完卷宗/, r.coach ? /爸。二〇一六年/ : /我只是做我的工作/];
  if (r.mediation === 'low') PREFER.unshift(/休息$/);
  await page.goto('/');
  await click(page, '新遊戲');
  await click(page, /^第 2 集/);
  const iv = page.getByRole('button', { name: /疲勞提醒是怎麼運作的/ });
  await until(page, () => iv.isVisible(), dir, 'to-interview');
  for (const q of [/疲勞提醒是怎麼運作的/, /赫克托・維加這個人/, /提醒一直都是這樣嗎/])
    await click(page, q);
  await shot('interview');
  await page.getByRole('tab', { name: '施壓' }).click();
  await click(page, /不接單，評分就會被扣/);
  await page
    .getByRole('button', { name: /^(結束會見|離開會見室)$/ })
    .first()
    .click();
  const desk = page.getByRole('button', { name: /^卷宗( \d+)?$/ });
  await until(page, () => desk.isVisible(), dir, 'to-desk');

  // 第二幕
  await page.getByRole('button', { name: /^郵件/ }).first().click();
  for (const m of await page.locator('main .row-item strong').allTextContents()) {
    await page.locator('main .row-item', { hasText: m }).click();
    await click(page, '← 收件匣');
  }
  await readFact(page, /起訴狀/, [/請求過失致死/, /派單系統持續派單/]);
  await readFact(page, /死亡證明與現場報告/, [/死因：急性心肌梗塞/]);
  await readFact(page, /派單系統文件夾/, [/版本 2.3 規格書/]);
  await readFact(page, /原告專家報告/, [/每週工時超過 60/, /附註 7/]);
  for (const j of [/藥局領藥紀錄/, /設定變更紀錄/, /法務意見/]) await delegate(page, j);
  await page.getByRole('button', { name: /^郵件/ }).first().click();
  for (const m of await page.locator('main .row-item.unread strong').allTextContents()) {
    await page.locator('main .row-item', { hasText: m }).click();
    await click(page, '← 收件匣');
  }
  await click(page, '證據板');
  let f = 0;
  const solve = async (title: string, cards: (string | RegExp)[], rel: RegExp) => {
    await expect(await link(page, title, cards, rel)).toContainText('連起來了');
    await answer(page, ++f);
  };
  await solve('費雪醫師的 2.4 倍', ['費雪醫師報告', /費雪報告附註/], /縮小範圍/);
  await solve('赫克托知道自己的身體', ['家醫病歷：高血壓', /藥局紀錄/], /支持/);
  await solve('公司的提醒，有沒有送到他手上', [/App 日誌：疲勞提醒/, '承攬合約'], /支持/);
  await solve('疲勞提醒本來就是現在這樣嗎', [/舊版規格書/, /設定變更單/], /矛盾/);
  await solve('公司為什麼要改', [/設定變更單/, /營運群組/], /說明動機/);
  await solve('公司有沒有要求他一定要上線', ['承攬合約', /崔佛的說法/], /支持/);
  await solve('赫克托自己的那一份', [/赫克托的語音/, /App 日誌：疲勞提醒/], /支持/);
  L.push(`[第二幕] 板子完成，工時 ${await hours(page)}`);
  await page.getByRole('button', { name: /^開示/ }).first().click();
  for (let i = 0; i < 4; i++) {
    const g = page.locator('.req').nth(i).getByRole('group');
    if (!(await g.isVisible().catch(() => false))) {
      L.push(`[開示] 第二幕只有 ${i} 項請求`);
      break;
    }
    await g.getByRole('button', { name: r.disc[i] }).click();
    await page.locator('.commit-bar button.commit').first().click();
    const back = page.getByRole('button', { name: '回到桌面' });
    if (await back.isVisible().catch(() => false)) {
      await back.click();
      await page.getByRole('button', { name: /^開示/ }).first().click();
    }
    L.push(
      `[開示] 請求 ${i + 1} ${r.disc[i]} → ${await page.locator('.req').nth(i).locator('.req-result').textContent()}`,
    );
  }
  {
    const b = page.getByRole('button', { name: '← 全部疑問' });
    if (await b.isVisible().catch(() => false)) await b.click();
  }
  await click(page, '結束調查');
  await click(page, /確定結束/);

  // 第三幕：錄取崔佛（#160 起奧卡福問、盧卡斯只能異議）
  await until(
    page,
    async () => (await has(page, '不異議')) || (await has(page, '開始錄取')),
    dir,
    'to-depo',
  );
  if (await has(page, '開始錄取')) await click(page, '開始錄取');
  await shot('depo-trevor');
  const tplan = r.sloppy
    ? Array(7).fill('不異議')
    : ['不異議', '不異議', '不異議', '缺乏基礎', '不異議', '特權', '推測'];
  for (const o of tplan) {
    if (!(await has(page, '不異議'))) {
      L.push(`[錄取崔佛] 題目比預期少，停在 ${o}`);
      break;
    }
    const q = (await main(page)).slice(-80);
    await click(page, o);
    await page.waitForTimeout(150);
    L.push(`[錄取崔佛] ${o} ← …${q}`);
  }
  await shot('depo-trevor-asked');
  L.push(`[錄取崔佛結束] ${(await main(page)).slice(-300)}`);
  // 對方錄取工程師：只能異議
  await until(
    page,
    async () => (await page.locator('main button:visible').count()) > 2,
    dir,
    'to-depo2',
  );
  L.push(
    `[錄取工程師] ${(await main(page)).slice(-300)}｜${(await page.locator('main button:visible').allTextContents()).join(' | ')}`,
  );
  await shot('depo-engineer');
  const plan = [
    '不異議',
    '不異議',
    '推測',
    '傳聞',
    r.mediation === 'walk' && r.theory === '他自己的選擇' ? '無關' : '不異議',
  ];
  for (const o of plan) {
    if (!(await has(page, '不異議'))) {
      L.push(`[錄取工程師] 題目比預期少，停在 ${o}`);
      break;
    }
    await click(page, o);
    await page.waitForTimeout(150);
  }
  await shot('depo-engineer-done');
  L.push(`[錄取工程師結束] ${(await main(page)).slice(0, 400)}`);
  // 審前桌面
  await until(page, () => desk.isVisible(), dir, 'to-pretrial');
  L.push(
    `[審前] 工時 ${await hours(page)}，按鈕：${(await page.locator('nav button:visible, [role=tablist] button:visible').allTextContents()).join(' | ')}`,
  );
  await shot('pretrial');
  await readFact(page, /崔佛.*錄取逐字稿/, [/從系統上線就是提醒/]);
  await click(page, '證據板');
  await expect(
    await link(page, '崔佛在錄取時說的', [/崔佛的宣誓陳述/, /設定變更單/], /矛盾/),
  ).toContainText('連起來了');
  await answer(page, 1);
  if (r.errata) {
    await click(page, '委託');
    const job = page
      .locator('li:has(> strong)')
      .filter({ has: page.locator('strong', { hasText: /請崔佛更正筆錄/ }) });
    L.push(`[更正筆錄] 可委託：${await job.count()}`);
    await job
      .getByRole('button', { name: /^委託（\d 工時）$/ })
      .first()
      .click();
    await page.waitForTimeout(300);
    L.push(`[更正筆錄] ${(await main(page)).slice(-300)}`);
    await click(page, '回到桌面');
  }
  // 第五項請求（法務意見書）#160 起在審前
  if (await has(page, /^開示/)) {
    await page.getByRole('button', { name: /^開示/ }).first().click();
    const g = page.getByRole('group', { name: /的回應$/ }).last();
    if (await g.isVisible().catch(() => false)) {
      await g.getByRole('button', { name: r.disc[4], exact: true }).first().click();
      await page.locator('.commit-bar button.commit').first().click();
      await page.waitForTimeout(300);
      L.push(`[開示・意見書] ${r.disc[4]} → ${(await main(page)).slice(-200)}`);
    } else L.push('[開示・意見書] 審前沒有看到請求');
    if (await has(page, '回到桌面')) await click(page, '回到桌面');
  } else L.push('[開示・意見書] 審前沒有開示按鈕');
  if (r.daubert) {
    await click(page, '法院系統');
    L.push(
      `[Daubert] 證據欄有論點 C：${await page.locator('li.card.mini.pickable', { hasText: /論點 C/ }).count()}`,
    );
    await fileMotion(page, '排除該專家證詞', '專家證詞可靠性', /費雪報告附註/);
    await page.waitForTimeout(300);
    L.push(`[Daubert] ${(await main(page)).slice(0, 200)}`);
    await click(page, '回到桌面');
  }
  {
    const b = page.getByRole('button', { name: '← 全部疑問' });
    if (await b.isVisible().catch(() => false)) await b.click();
  }
  await click(page, '結束調查');
  await click(page, /確定結束/);
  const seat = page.locator('main button:visible');
  await until(
    page,
    async () => (await seat.count()) >= 3 || (await has(page, '坐下')),
    dir,
    'to-mediation',
  );
  L.push(`[調解] ${(await main(page)).slice(-300)}｜${(await seat.allTextContents()).join(' | ')}`);
  await shot('mediation');
  await click(page, '坐下');
  await shot('mediation-table');
  const offer = async () =>
    ((await page.locator('main').innerText()).match(/對方現在開的條件\s*(.+)/)?.[1] ?? '?').split(
      '\n',
    )[0];
  L.push(`[調解] 開場條件：${await offer()}`);
  const reveal = async (a: RegExp) => {
    await click(page, '攤牌').catch(() => {});
    const c = page.locator('main .pick-name').filter({ hasText: a }).first();
    if (!(await c.isVisible().catch(() => false))) {
      L.push(`[調解] 沒有 ${a.source} 可攤`);
      return;
    }
    await c.click();
    await page.waitForTimeout(150);
    await click(page, '對方開的條件').catch(() => {});
    L.push(`[調解] 攤牌 ${a.source} → ${await offer()}`);
  };
  const callUntilOk = async () => {
    for (let i = 0; i < 2; i++) {
      const btns = (await page.locator('main button:visible').allTextContents()).filter((t) =>
        /建議/.test(t),
      );
      if (!btns.some((t) => /超過授權/.test(t))) break;
      if (!(await has(page, /打電話請示/)) || !(await vis(page, /打電話請示/).isEnabled())) break;
      await click(page, /打電話請示/);
      await page.waitForTimeout(200);
      L.push(
        `[調解] 打給亞瑟 ${i + 1}：${(await main(page)).match(/(亞瑟・卡爾德 [^亞]{0,60})/g)?.slice(-1)}`,
      );
    }
    L.push(
      `[調解] 最後：${await offer()}；${(await page.locator('main button:visible').allTextContents()).filter((t) => /建議/.test(t)).join(' | ')}`,
    );
  };
  const bluff = async (b: RegExp) => {
    await click(page, '虛張聲勢').catch(() => {});
    const x = page.getByRole('button', { name: b });
    if (!(await x.isVisible().catch(() => false))) {
      L.push(`[調解] 虛張 ${b.source} 不可選`);
      return;
    }
    await x.click();
    await page.waitForTimeout(150);
    await click(page, '對方開的條件').catch(() => {});
    L.push(`[調解] 虛張 ${b.source} → ${await offer()}`);
  };
  const accept = async () => {
    await vis(page, /^建議亞瑟・卡爾德接受/).click();
    await page.waitForTimeout(150);
    {
      const c = page.locator('.commit-bar button.commit');
      if (await c.isVisible().catch(() => false)) await c.click();
    } // #166 起要再按定案
  };
  if (r.mediation === 'take') {
    // 遊戲系統 #172 路線 (a)：攤 A → 虛張醫療紀錄 → 虛張專家 → 兩通電話，250 萬
    await reveal(/論點 A/);
    await bluff(/沒吃藥/);
    await bluff(/專家撐不到開庭/);
    await callUntilOk();
    await accept();
  } else if (r.mediation === 'low') {
    // 路線 (b)：攤 A、B → 兩個虛張 → 一通電話，180 萬
    await reveal(/論點 A/);
    await reveal(/論點 B/);
    await shot('mediation-reveal');
    await bluff(/沒吃藥/);
    await bluff(/專家撐不到開庭/);
    await shot('mediation-low');
    await callUntilOk();
    await accept();
  } else {
    await click(page, '離席');
    await page.waitForTimeout(150);
    {
      const c = page.locator('.commit-bar button.commit');
      if (await c.isVisible().catch(() => false)) await c.click();
    }
  }
  await shot('mediation-end');
  L.push(`[調解結束] ${(await main(page)).slice(-250)}`);
  if (r.mediation !== 'walk') {
    const end = page
      .getByRole('heading', { name: /^(本集完|待續|End of episode|To be continued)$/ })
      .or(page.getByRole('button', { name: /^(回標題|Back to title)$/ }))
      .first();
    await until(page, () => end.isVisible(), dir, 'to-end-deal', 80);
    L.push(`[結局] ${(await main(page)).slice(0, 100)}`);
    return;
  }
  await court(page, r, dir, shot);
}

/** 要異議的題目（劇本標的毛病）。 */
const OBJ: [RegExp, string][] = [
  [/告訴他不准休息/, '傳聞'],
  [/在乎他的命/, '推測'],
  [/難道不是冷血/, '誘導'],
  [/就是過勞造成的/, '誘導'],
  [/早就知道這份研究/, '推測'],
  [/同事也告訴過您/, '傳聞'],
  [/早點休息，就不會死/, '推測'],
  [/二點四倍，您同意/, '傳聞'],
  [/明明可以讓他下線/, '缺乏基礎'],
];
/** 交互詰問：主張 → 強鎖定 → 鋪墊 → 出示的論點。 */
const CROSS: [RegExp, RegExp, RegExp, RegExp][] = [
  [/身體一直很好/, /最後那三個月/, /吃的是什麼藥/, /論點 A/],
  [/適用於所有長時間駕駛/, /樣本裡，有市區外送/, /一趟平均開多久/, /論點 C/],
  [/根本沒有機會意識到/, /根本沒有機會」知道/, /App 日誌嗎/, /論點 B/],
  [/最主要的原因/, /比沒有控制的高血壓還主要/, /三個月後發生心肌梗塞/, /論點 A/],
  [/公司逼他一直跑/, /是有人規定他每天要跑/, /什麼時候出門、什麼時候收工/, /論點 D/],
  [/很難察覺身體已經到極限/, /沒有任何方式可以知道自己太累/, /每隔一段時間就跳出來提醒/, /論點 B/],
  [/是 App 不讓他走/, /他有跟您說過他想收工/, /那則語音，您後來聽了幾次/, /論點 H/],
];
const THEORY: Record<R['theory'], string> = {
  他自己的選擇: '他自己的選擇',
  公司已盡告知義務: '公司已盡告知義務',
  責任該分攤: '責任該分攤',
};

async function court(page: Page, r: R, dir: string, shot: (s: string) => Promise<unknown>) {
  const end = page
    .getByRole('heading', { name: /^(本集完|待續|End of episode|To be continued)$/ })
    .or(page.getByRole('button', { name: /^(回標題|Back to title)$/ }))
    .first();
  const seen = new Set<string>();
  let verdictSeen = false;
  let epi = false;
  let objected = 0;
  let live = false;
  for (let step = 0; step < 400; step++) {
    if (await end.isVisible().catch(() => false)) break;
    await tick(page);
    // 判決之後的第一場對話（尾聲）。
    const rich = async () =>
      (await page.locator('main .speech').count()) >= 3 ||
      (await page
        .getByRole('group', { name: '選擇' })
        .isVisible()
        .catch(() => false));
    if (
      verdictSeen &&
      !epi &&
      !(await page
        .locator('.vform')
        .isVisible()
        .catch(() => false)) &&
      (await rich())
    ) {
      await page
        .locator('.act-stage:not(:has(.act-actions))')
        .waitFor({ state: 'detached', timeout: 12000 })
        .catch(() => {});
      if (!(await end.isVisible().catch(() => false))) {
        epi = true;
        await shot('epilogue');
      }
    }
    const t = await main(page);
    if (await has(page, '選擇案件理論')) {
      await at(page, 'theory-intro');
      await click(page, '選擇案件理論');
      await shot('theory');
      const panels = page.locator('button.theory-card');
      L.push(
        `[理論] ${(await panels.allTextContents()).map((x) => x.replace(/\s+/g, ' ').slice(0, 80)).join(' ／ ')}`,
      );
      const b = panels.filter({ hasText: THEORY[r.theory] });
      L.push(`[理論] ${r.theory} 可選：${await b.isEnabled()}`);
      await b.click();
      await page.getByRole('button', { name: '以這個理論開庭' }).click();
      continue;
    }
    if (await has(page, '開始遴選')) {
      await click(page, '開始遴選');
      await shot('voirdire');
      L.push(`[遴選] ${(await main(page)).slice(0, 600)}`);
      L.push(
        `[遴選按鈕] ${(await page.locator('main button:visible').allTextContents()).join(' | ')}`,
      );
      const seat = page.getByRole('button', { name: /^就用這/ });
      await seat.click();
      continue;
    }
    if (await has(page, '開始陳述')) {
      await click(page, '開始陳述');
      await shot('opening');
      const ps = await page.locator('main button:visible').allTextContents();
      L.push(`[開場] ${ps.join(' | ')}`);
      let k = 0;
      for (const b of await page.locator('main button:visible').all()) {
        if (k < 2 && /你們會/.test((await b.textContent()) || '')) {
          await b.click();
          k++;
          await at(page, `opening-${k}of2`);
        }
      }
      await click(page, /許下 \d+ 個承諾|不許任何承諾/);
      continue;
    }
    if (await has(page, '聽下一個問題')) {
      await click(page, '聽下一個問題');
      await page.waitForTimeout(80);
      const q = (
        (await page
          .locator('.lines')
          .last()
          .innerText()
          .catch(() => '')) || ''
      ).replace(/\s+/g, ' ');
      const ask = q.slice(Math.max(q.lastIndexOf('檢察官'), q.lastIndexOf('奧卡福')));
      const hit = OBJ.find(([rx]) => rx.test(ask));
      const objs = await page
        .getByRole('button', { name: /^(誘導|傳聞|推測|無關|已問已答|缺乏基礎|特權)$/ })
        .allTextContents();
      if (!seen.has('objs')) {
        seen.add('objs');
        L.push(`[異議鈕] ${objs.join(' | ')}`);
      }
      if (hit && !r.sloppy && (await has(page, hit[1]))) {
        await click(page, hit[1]);
        objected++;
        await page.waitForTimeout(80);
        L.push(
          `[異議] ${hit[1]}：${hit[0].source} → ${(
            (await page
              .locator('.lines')
              .last()
              .innerText()
              .catch(() => '')) || ''
          )
            .replace(/\s+/g, ' ')
            .slice(-80)}`,
        );
      } else {
        if (hit) L.push(`[缺異議鈕] ${hit[1]}：${hit[0].source}`);
        await click(page, '不異議');
        // 異議過兩次之後：筆錄有內容、有裁定章，拍進行中的法庭（含深色、英文章）。
        if (objected >= 2 && !live) {
          live = true;
          await page.waitForTimeout(2500);
          await at(page, 'court-live');
        }
      }
      continue;
    }
    if (await has(page, '開始交互詰問')) {
      L.push(`[直接詰問結束] ${t.slice(-200)}`);
      await click(page, '開始交互詰問');
      await shot('cross');
      const claim = page.locator('article.claim');
      L.push(
        `[交互] 主張：${(await claim.allTextContents()).map((x) => x.replace(/\s+/g, ' ').slice(0, 60)).join(' ／ ')}`,
      );
      // #246 起分頁列有一顆量寬用的隱藏鈕（.apps-more.measure），放不下的分頁收進「更多」
      const tnav = page.locator('nav[aria-label="證詞"]');
      const direct = tnav.locator(':scope > button:not(.apps-more)');
      const moreBtn = tnav.locator(':scope > button.apps-more:not(.measure)');
      const dn = await direct.count();
      let mn = 0;
      if (await moreBtn.isVisible().catch(() => false)) {
        await moreBtn.click();
        mn = await tnav.locator('.apps-menu button').count();
        await moreBtn.click();
        L.push(`[交互] 分頁收進更多：${mn}`);
      }
      const tn = dn + mn;
      const tabs = {
        nth: (i: number) => ({
          click: async () => {
            if (i < dn) return direct.nth(i).click();
            await moreBtn.click();
            await tnav
              .locator('.apps-menu button')
              .nth(i - dn)
              .click();
          },
        }),
      };
      for (let i = 0; i < (r.sloppy ? 0 : Math.max(tn, 1)); i++) {
        if (tn) await tabs.nth(i).click();
        const art = page.locator('article.claim');
        const ct = (
          (await art
            .locator('.claim-text')
            .textContent()
            .catch(() => '')) || ''
        ).trim();
        const plan = CROSS.find(([c]) => c.test(ct));
        if (!plan) {
          L.push(`[交互] 沒有計畫：${ct}`);
          continue;
        }
        const [, lock, setup, arg] = plan;
        for (const x of [lock, setup]) {
          const b = art.getByRole('button', { name: x }).first();
          if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false)))
            await b.click();
          else L.push(`[交互] ${ct.slice(0, 12)} 找不到 ${x.source}`);
        }
        const avail = await art.locator('.pick-name').allTextContents();
        const card = art.locator('.pick-name').filter({ hasText: arg }).first();
        if (await card.isVisible().catch(() => false)) await card.click();
        else L.push(`[交互] ${ct.slice(0, 12)} 沒有 ${arg.source}；可出示：${avail.join(' | ')}`);
        await page.waitForTimeout(150);
        L.push(
          `[交互] ${ct.slice(0, 16)}（可出示 ${avail.length} 張：${avail.slice(0, 7).join('、')}）→ ${(
            await page
              .locator('.lines, .transcript')
              .last()
              .innerText()
              .catch(() => '')
          )
            .replace(/\s+/g, ' ')
            .slice(-180)}`,
        );
      }
      await shot('cross-done');
      if (await has(page, '詰問完畢')) await click(page, '詰問完畢');
      continue;
    }
    const prep = page.getByRole('button', { name: /^準備.+出庭$/ });
    if (await prep.isVisible().catch(() => false)) {
      await prep.click();
      await shot('prep');
      L.push(`[準備] ${(await main(page)).slice(0, 400)}`);
      const want = r.coach ? '替他寫好答案' : '只問他確定的事';
      await page.getByRole('radio').filter({ hasText: want }).click();
      await page.getByRole('button', { name: /^就這樣準備/ }).click();
      const qs = page.locator('main ul.stack li button');
      for (let i = 0; i < (await qs.count()); i++) {
        const qb = qs.nth(i);
        const qt = ((await qb.textContent()) || '').slice(0, 28);
        if (!(await qb.isEnabled())) {
          L.push(`[崔佛] 不能問：${qt}`);
          continue;
        }
        if (r.skipAlways && /一直都是這樣嗎/.test(qt)) {
          L.push(`[崔佛] 刻意不問：${qt}`);
          continue;
        }
        await qb.click();
        await page.waitForTimeout(150);
        L.push(`[崔佛] 問 ${qt} → ${(await main(page)).slice(-160)}`);
      }
      L.push(`[崔佛] ${(await main(page)).slice(-400)}`);
      await shot('trevor');
      if (await has(page, '問完了')) await click(page, '問完了');
      await page.waitForTimeout(150);
      L.push(`[崔佛反詰問] ${(await main(page)).slice(-500)}`);
      await shot('trevor-cross');
      continue;
    }
    if (await has(page, '訴求基調')) {
      await shot('closing');
      const args = page.locator('.pick-name', { hasText: /^論點/ });
      const names = await args.allTextContents();
      L.push(`[結辯] 可選論點：${names.join(' | ')}`);
      const want = {
        他自己的選擇: [/論點 A/, /論點 B/],
        公司已盡告知義務: [/論點 B/, /論點 D/],
        責任該分攤: [/論點 A/, /論點 H/],
      }[r.theory];
      let picked = 0;
      for (const w of want) {
        const a = args.filter({ hasText: w }).first();
        if (await a.isVisible().catch(() => false)) {
          await a.click();
          picked++;
        } else L.push(`[結辯] 想用 ${w.source} 但不能選`);
      }
      for (let i = 0; picked < 2 && i < names.length; i++) {
        const a = args.nth(i);
        if (
          (await a.locator('xpath=ancestor::button[1]').getAttribute('aria-pressed')) !== 'true'
        ) {
          await a.click();
          picked++;
        }
      }
      await click(page, '訴求基調');
      await page.locator('.pick-name').filter({ hasText: /邏輯/ }).first().click();
      await at(page, 'closing-picked');
      await click(page, '開始結辯');
      // #253：判決是 6 秒的四拍，等結論標題出現再拍
      await page
        .getByRole('heading', {
          name: /無罪|有罪|無責|有責|僵局|無法達成|未達一致|審判無效|未達法定票數/,
        })
        .first()
        .waitFor({ timeout: 30000 });
      await page.waitForTimeout(300);
      await shot('verdict');
      verdictSeen = true;
      L.push(`[判決] ${(await main(page)).slice(0, 500)}`);
      continue;
    }
    if (await has(page, '開庭')) {
      await click(page, '開庭');
      continue;
    }
    const before = t;
    await until(page, async () => (await main(page)) !== before, dir, `court-${step}`, 4).catch(
      async () => {
        // #247 異議那一拍：輸入鎖住約 2–3 秒，先等拍子走完再判斷卡住
        await page.screenshot({ path: `${dir}/beat-${step}-a.png` }).catch(() => {});
        await page.waitForTimeout(4000);
        await page.screenshot({ path: `${dir}/beat-${step}-b.png` }).catch(() => {});
        L.push(`[拍子等待] step ${step}`);
        await until(
          page,
          async () => (await main(page)) !== before,
          dir,
          `court-${step}b`,
          6,
        ).catch(async () => {
          throw new Error('court stuck');
        });
      },
    );
  }
  L.push(`[結局] ${(await main(page)).slice(0, 300)}`);
  await shot('end');
}

for (const [name, r] of Object.entries(ROUTES)) {
  test(name, async ({ page }, info) => {
    bibleViolations.length = 0;
    const dir = `/tmp/qa-shots/ep2full-${info.project.name}/${name.replace(/[ ＋]/g, '_')}`;
    mkdirSync(dir, { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await installExtra(page);
      await installLineCheck(page);
      await play2(page, r, dir);
      const lr = await lineResult(page);
      for (const f of lr.fails) L.push(`[台詞沒出現] ${f.kind}｜${f.scene}｜${f.label}`);
      L.push(`[台詞檢查] 檢查 ${lr.checked} 句，缺 ${lr.fails.length} 句`);
      expectLines(lr.fails.map((f) => `${f.kind}｜${f.label}`)).toEqual([]);
      // BIBLE=1（CI 的 routes 工作）時，設定集稽核的違規也要是空的。
      expectLines.soft(bibleViolations, '設定集稽核').toEqual([]);
    } finally {
      for (const e of errors) L.push(`[頁面錯誤] ${e}`);
      appendFileSync(
        '/tmp/qa-ep2full.txt',
        `\n## [${info.project.name}] ${name}\n${L.join('\n')}\n`,
      );
      L.length = 0;
    }
  });
}
