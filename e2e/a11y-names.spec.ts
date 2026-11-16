/// <reference lib="dom" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { CONTINUE, enter, FAST, SCENES, SIZES, STEPS } from './scan/scenes';

/**
 * 無障礙名稱全站比對（pipeline/process-v2.md 第 5 節第 10 項）：
 * 第二道關卡 b/work14/scan14.js＋a14.py 的做法是「同一個狀態，每顆按鈕的名稱排序後逐顆和上一版比」，
 * c/r8-scan.js 另外抓名稱本身的毛病。這裡兩件都做，範圍是規則 1 掃描的同一組狀態（e2e/scan/scenes.ts）。
 *
 * 1. 名稱的毛病：判法和擋不擋照設計師裁定（見下面 flaws()）。zh 的 1366、412 擋（PR 快速層），
 *    其他尺寸照跑只記在報告的 annotations。
 * 2. 和上一版比：每個狀態的按鈕名稱清單存在 e2e/scan/a11y-names/。改了按鈕的字就會紅，
 *    確定是要改的，跑 `npm run a11y:names` 重寫基準，連同程式一起提交，PR 的 diff 就看得到名稱怎麼變。
 */
const UPDATE = !!process.env.UPDATE_A11Y_NAMES;
// 檔名帶場景名稱：同一場同一步可能有兩個進場點（第 1 集第 7 場的桌面和證據板）。
const baseFile = (size: string, ep: string, scene: number, step: number, label: string) =>
  new URL(`./scan/a11y-names/${size}/${ep}-${scene}-${step}-${label}.json`, import.meta.url);

type Btn = {
  name: string;
  desc: string;
  text: string;
  labelled: boolean;
  fits: string[];
  /** 讀屏念得到的、畫面上看得到的每一段字（不含 aria-hidden，不含被子元素 aria-label 取代的字）。 */
  chunks: string[];
  /** 按鈕第一行（標題行）的字。 */
  first: string[];
  /** 作者寫的 aria-label（按鈕自己和裡面的）。 */
  labels: string[];
};

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
          const STATUS = ${JSON.stringify(STATUS)};
          for (let x = this; x && x !== document.body; x = x.parentElement) {
            const cs = getComputedStyle(x);
            if (cs.display === 'none' || cs.visibility === 'hidden' || x.hasAttribute('inert')) return null;
          }
          const r = this.getBoundingClientRect();
          if (!r.width || !r.height) return null;
          const own = (e) => {
            for (let x = e; x && x !== this; x = x.parentElement)
              if (x.getAttribute('aria-hidden') === 'true' || x.hasAttribute('aria-label')) return false;
            return true;
          };
          const nodes = [];
          const w = document.createTreeWalker(this, NodeFilter.SHOW_TEXT);
          for (let t = w.nextNode(); t; t = w.nextNode()) {
            if (!t.data.trim() || !own(t.parentElement)) continue;
            // 狀態小標（設計師 11-16 准）：可以只放在描述裡，或由 aria-pressed／aria-checked 表達。
            const status = !!t.parentElement.closest(STATUS);
            if (status && (this.hasAttribute('aria-pressed') || this.hasAttribute('aria-checked')))
              continue;
            const rg = document.createRange();
            rg.selectNodeContents(t);
            const rs = [...rg.getClientRects()].filter((q) => q.width && q.height);
            if (rs.length) nodes.push({ s: t.data, top: rs[0].top, h: rs[0].height, status });
          }
          const top = Math.min(...nodes.map((x) => x.top));
          return {
            text: this.textContent || '',
            labelled: this.hasAttribute('aria-label') || this.hasAttribute('aria-labelledby'),
            // 折行的字（fitLine 拆成 .zh-line 的那幾段），r8-scan 的 fits。
            fits: [...this.querySelectorAll('*')]
              .filter((e) => e.querySelector(':scope > .zh-line'))
              .map((e) => e.textContent || ''),
            chunks: nodes.map((x) => x.s),
            first: nodes.filter((x) => !x.status && x.top < top + x.h / 2).map((x) => x.s),
            labels: [this, ...this.querySelectorAll('[aria-label]')]
              .map((e) => e.getAttribute('aria-label'))
              .filter((x) => x),
          };
        }`,
      });
      if (!result.value) continue;
      out.push({
        name: String(n.name?.value ?? ''),
        desc: String(n.description?.value ?? ''),
        ...result.value,
      });
    }
    return out;
  } finally {
    await cdp.detach();
  }
}

/**
 * c/r8-scan.js 的名稱毛病，照設計師的裁定（ux/art-bible-gap/impl/ci-ax-names/designer-ruling.md，含 11-16 補判）：
 * 擋（block）：
 * - 名稱有換行；名稱有箭頭（› > »）；折行的字不在名稱裡；
 * - 名稱開頭結尾有空白、連續兩個以上空白（整個名稱查）；
 * - 中文字之間夾空白：只查作者寫的字（aria-label 的值、單一段文字），區塊之間瀏覽器補的空白不算；
 *   全形空白在畫面的字裡可以（排版分隔），aria-label 裡不行；
 * - 第一行（標題行）看得到的字要在名稱裡；其他看得到的字去掉裝飾符號（✓ › • · ＋ +）以後，
 *   要在「名稱＋aria-describedby 描述」裡找得到。
 * 只記（note）：沒有 aria-label 的按鈕，名稱和畫面字不完全一樣。
 * 不設白名單；真的要例外，在這裡寫明是哪個按鈕、為什麼，並請設計師看過。
 * 例外：狀態小標（見 STATUS）可以只在描述裡，或由 aria-pressed／aria-checked 表達（設計師 11-16 准）。
 */
const HAN = '[\\p{Script=Han}（）「」，。、：；！？]';
const hanGap = (ws: string) => new RegExp(`${HAN}[${ws}]+${HAN}`, 'u');
const DECOR = /[✓›•·＋+]/g;
/**
 * 狀態小標（設計師 11-16 補判）：只有這些可以不在名稱裡——放在 aria-describedby，或按鈕有 aria-pressed／aria-checked
 * 時由它表達。標題行上其他的字一律要在名稱裡。新的狀態小標加 data-ax="status"。
 */
const STATUS = '[data-ax="status"], .found-new, .found-used-tag';
function flaws(bs: Btn[]) {
  const block: string[] = [];
  const note: string[] = [];
  const squash = (x: string) => x.replace(/[\s\u00a0]/g, '');
  for (const b of bs) {
    const n = b.name;
    const sn = squash(n);
    if (/[\n\r\u2028\u2029]/.test(n)) block.push(`名稱有換行：${n.slice(0, 50)}`);
    if (/[›>»]/.test(n)) block.push(`箭頭字元：${n.slice(0, 50)}`);
    if (/\s{2,}/.test(n) || n !== n.trim()) block.push(`多餘空白：「${n.slice(0, 80)}」`);
    for (const l of b.labels)
      if (hanGap('\\s').test(l)) block.push(`aria-label 中文字之間有空白：「${l.slice(0, 80)}」`);
    for (const c of b.chunks)
      if (hanGap(' \\t\\n\\r\\u00a0').test(c.trim()))
        block.push(`畫面字中文字之間有空白：「${c.trim().slice(0, 80)}」`);
    for (const f of b.fits)
      if (!sn.includes(squash(f)))
        block.push(`折行的字不在名稱裡：${f.slice(0, 30)} ∉ ${n.slice(0, 80)}`);
    const lost = b.first.filter((c) => {
      const sc = squash(c.replace(DECOR, ''));
      return sc && !sn.includes(sc);
    });
    if (lost.length)
      block.push(`標題行不在名稱裡：${lost.join('').trim().slice(0, 40)} ∉ ${n.slice(0, 60)}`);
    const all = squash(n + b.desc);
    const miss = b.chunks.filter((c) => {
      const sc = squash(c.replace(DECOR, ''));
      return sc && !all.includes(sc);
    });
    if (miss.length)
      block.push(
        `畫面字不在名稱或描述裡：${miss.join('').trim().slice(0, 40)} ∉ ${n.slice(0, 60)}`,
      );
    if (!b.labelled && squash(n) !== squash(b.text))
      note.push(`名稱≠畫面字：${n.slice(0, 60)} ≠ ${b.text.trim().slice(0, 60)}`);
  }
  return { block, note };
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
    test.skip(UPDATE && !!sz.tier23, '第二、三級不存基準，只查名稱的毛病');
    for (const [ep, scene, label, step, seed] of SCENES) {
      test(`${ep} 第 ${scene} 場 ${label}（步 ${step}）`, async ({ page }) => {
        test.setTimeout(120_000);
        await enter(page, ep, scene, step, seed, sz);
        const board = seed.startsWith('board');
        const seen: string[][] = [];
        const bad: string[] = [];
        const notes: string[] = [];
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
          const f = flaws(bs);
          bad.push(...f.block.map((x) => `第 ${seen.length} 個畫面 ${x}`));
          notes.push(...f.note.map((x) => `第 ${seen.length} 個畫面 ${x}`));
          const c = page.getByRole('button', { name: CONTINUE }).filter({ visible: true });
          if (!(await c.count())) break;
          await c.first().click();
        }
        // 擋的範圍照設計師裁定：zh 的第一級組合（1366、412）。其他尺寸照跑只記報告，
        // 「C 級」的由 CI 的 tier23 工作開成 C 級 Issue（第二級不擋）。
        for (const x of [...new Set(notes)])
          test.info().annotations.push({ type: '名稱≠畫面字（只記）', description: x });
        if (!sz.fast)
          for (const x of [...new Set(bad)])
            test.info().annotations.push({ type: 'C 級', description: x });
        else expect.soft([...new Set(bad)], `按鈕名稱的毛病（${sz.name}）`).toEqual([]);
        // 第二、三級（英文、放大字、窄螢幕）只查名稱的毛病，不和基準比。
        if (sz.tier23) return;
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
