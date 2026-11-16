/// <reference lib="dom" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { enter, FAST, SCENES, SIZES, STEPS } from './scan/scenes';

/**
 * 無障礙名稱全站比對（pipeline/process-v2.md 第 5 節第 10 項）：
 * 第二道關卡 b/work14/scan14.js＋a14.py 的做法是「同一個狀態，每顆按鈕的名稱排序後逐顆和上一版比」，
 * c/r8-scan.js 另外抓名稱本身的毛病。這裡兩件都做，範圍是規則 1 掃描的同一組狀態（e2e/scan/scenes.ts）。
 *
 * 1. 名稱的毛病（先記在報告的 annotations，不擋；門檻待設計師裁定）：
 *    - 開頭有箭頭字元（›、>、»）；
 *    - 多餘空白：兩個以上空白、頭尾空白、中文字和中文標點之間夾空白；
 *    - 名稱裡有換行；
 *    - 沒有 aria-label 的按鈕，名稱和畫面上的字不一樣。
 * 2. 和上一版比：每個狀態的按鈕名稱清單存在 e2e/scan/a11y-names/。改了按鈕的字就會紅，
 *    確定是要改的，跑 `npm run a11y:names` 重寫基準，連同程式一起提交，PR 的 diff 就看得到名稱怎麼變。
 */
const UPDATE = !!process.env.UPDATE_A11Y_NAMES;
// 檔名帶場景名稱：同一場同一步可能有兩個進場點（第 1 集第 7 場的桌面和證據板）。
const baseFile = (size: string, ep: string, scene: number, step: number, label: string) =>
  new URL(`./scan/a11y-names/${size}/${ep}-${scene}-${step}-${label}.json`, import.meta.url);

type Btn = { name: string; text: string; labelled: boolean };

async function buttons(page: Page): Promise<Btn[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const out: Btn[] = [];
    for (const n of nodes) {
      if (n.ignored || n.role?.value !== 'button' || !n.backendDOMNodeId) continue;
      const { object } = await cdp
        .send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId })
        .catch(() => ({ object: undefined }));
      if (!object?.objectId) continue;
      const { result } = await cdp.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        returnByValue: true,
        functionDeclaration: `function () {
          for (let x = this; x && x !== document.body; x = x.parentElement) {
            const cs = getComputedStyle(x);
            if (cs.display === 'none' || cs.visibility === 'hidden' || x.hasAttribute('inert')) return null;
          }
          const r = this.getBoundingClientRect();
          if (!r.width || !r.height) return null;
          return {
            text: this.textContent || '',
            labelled: this.hasAttribute('aria-label') || this.hasAttribute('aria-labelledby'),
          };
        }`,
      });
      if (!result.value) continue;
      out.push({ name: String(n.name?.value ?? ''), ...result.value });
    }
    return out;
  } finally {
    await cdp.detach();
  }
}

/** c/r8-scan.js 的四種毛病，照原本的判法。 */
function flaws(bs: Btn[]) {
  const bad: string[] = [];
  for (const b of bs) {
    const n = b.name;
    if (/^[›>»]\s?/.test(n) || /›/.test(n)) bad.push(`箭頭字元：${n.slice(0, 50)}`);
    if (
      /\s{2,}/.test(n) ||
      n !== n.trim() ||
      /[\p{Script=Han}（）「」，。、：；！？]\s+[\p{Script=Han}（）「」，。、：；！？]/u.test(n)
    )
      bad.push(`多餘空白：「${n.slice(0, 80)}」`);
    if (/[\n\r\u2028\u2029]/.test(n)) bad.push(`名稱有換行：${n.slice(0, 50)}`);
    const norm = b.text.replace(/[\s\u00a0]+/g, ' ').trim();
    if (!b.labelled && n.replace(/\s/g, '') !== norm.replace(/\s/g, ''))
      bad.push(`名稱≠畫面字：${n.slice(0, 60)} ≠ ${norm.slice(0, 60)}`);
  }
  return bad;
}

test.describe.configure({ mode: 'parallel' });

for (const sz of SIZES) {
  test.describe(`無障礙名稱 ${sz.name}`, () => {
    test.use({
      viewport: sz.viewport,
      isMobile: sz.mobile,
      hasTouch: sz.mobile,
      deviceScaleFactor: sz.mobile ? 2 : 1,
    });
    // eslint-disable-next-line no-empty-pattern
    test.beforeEach(({}, info) =>
      test.skip(info.project.name !== 'desktop', '每個尺寸只跑一次（viewport 自己設）'),
    );
    test.skip(FAST && !sz.fast && !UPDATE, '第一級以外的尺寸只在合併後的全站掃描跑');
    for (const [ep, scene, label, step, seed] of SCENES) {
      test(`${ep} 第 ${scene} 場 ${label}（步 ${step}）`, async ({ page }) => {
        test.setTimeout(120_000);
        await enter(page, ep, scene, step, seed);
        const board = seed.startsWith('board');
        const seen: string[][] = [];
        const bad: string[] = [];
        // 基準一律存全站掃描的步數（8 步）；PR 只走前 3 步，只比前 3 步。
        const steps = UPDATE ? 8 : STEPS;
        for (let k = 0; k < (board ? 1 : steps); k++) {
          await page.waitForTimeout(1300);
          const pb = page.locator('.place-beat:visible');
          if (!board && (await pb.count())) {
            await pb.first().click();
            continue;
          }
          await page.evaluate(() => document.fonts.ready);
          const bs = await buttons(page);
          seen.push(bs.map((b) => b.name).sort());
          bad.push(...flaws(bs).map((x) => `第 ${seen.length} 個畫面 ${x}`));
          const c = page.getByRole('button', { name: /^繼續$/ }).filter({ visible: true });
          if (!(await c.count())) break;
          await c.first().click();
        }
        // 名稱的毛病先記在報告裡、不擋：第二道關卡只比「和上一版一樣不一樣」，這四種毛病沒有定過門檻（待設計師裁定）。
        for (const x of [...new Set(bad)])
          test.info().annotations.push({ type: '名稱的毛病', description: x });
        const file = baseFile(sz.name, ep, scene, step, label);
        if (UPDATE) {
          mkdirSync(dirname(file.pathname), { recursive: true });
          writeFileSync(file, JSON.stringify(seen, null, 1) + '\n');
          return;
        }
        expect(existsSync(file), `沒有基準：跑 npm run a11y:names 產生`).toBe(true);
        const base = (JSON.parse(readFileSync(file, 'utf8')) as string[][]).slice(0, seen.length);
        expect(
          seen,
          `按鈕名稱和上一版不同（${sz.name}，${ep} 第 ${scene} 場 ${label}）。確定要改就跑 npm run a11y:names 更新基準`,
        ).toEqual(base);
      });
    }
  });
}
