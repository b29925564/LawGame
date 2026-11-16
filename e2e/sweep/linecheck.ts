/* 玩家選的那句話有沒有出現在畫面上（2026-11-16 從 qa/tests 搬進 repo，全站掃描用）。
 * 對話與手機的選項、會見的問話與施壓：點下去之後，那句話要出現在逐字稿裡（按鈕本身不算）。
 * 同時檢查同一組選項裡有沒有空白按鈕。 */
import type { Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';

export type LineFail = { kind: string; label: string; scene: string };

export async function installLineCheck(page: Page) {
  // 畫外字幕（.vo）蓋版：跟 e2e/slice.spec.ts 一樣點掉。
  // VO_NEEDLE：畫外字幕出現這段字時，中英文各截一張逐拍的圖（尾聲「碼頭九號。」）。
  const needle = process.env.VO_NEEDLE ? new RegExp(process.env.VO_NEEDLE) : null;
  let voN = 0;
  const progLang = (lang: string) =>
    page.evaluate(async (lang) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      (document.querySelector('.menu-toggle') as HTMLElement).click();
      await sleep(200);
      (document.querySelectorAll('.game-menu [role=tab]')[2] as HTMLElement).click();
      await sleep(200);
      (
        document.querySelector(`.game-menu .lang-switch button[lang="${lang}"]`) as HTMLElement
      ).click();
      await sleep(200);
      (document.querySelector('.menu-toggle') as HTMLElement).click();
      await sleep(300);
    }, lang);
  await page.addLocatorHandler(page.locator('.vo'), async () => {
    if (needle) {
      for (let k = 0; k < 8 && (await page.locator('.vo').count()); k++) {
        await page
          .locator('.vo-text.now')
          .waitFor({ timeout: 6000 })
          .catch(() => {});
        const txt = (
          await page
            .locator('.vo-text')
            .innerText()
            .catch(() => '')
        ).replace(/\s+/g, ' ');
        appendFileSync('/tmp/qa-vo.txt', `${voN} ${txt}\n`);
        if (!needle.test(txt)) break;
        mkdirSync('/tmp/qa-vo', { recursive: true });
        await page.screenshot({ path: `/tmp/qa-vo/${voN}-zh-${k}.png` });
        await progLang('en');
        await page
          .locator('.vo-text.now')
          .waitFor({ timeout: 6000 })
          .catch(() => {});
        const en = (
          await page
            .locator('.vo-text')
            .innerText()
            .catch(() => '')
        ).replace(/\s+/g, ' ');
        appendFileSync('/tmp/qa-vo.txt', `${voN} EN ${en}\n`);
        await page.screenshot({ path: `/tmp/qa-vo/${voN}-en-${k}.png` });
        await progLang('zh-Hant');
        await page
          .locator('.vo-hit')
          .click({ force: true })
          .catch(() => {});
        await page.waitForTimeout(150);
      }
      voN++;
    }
    for (let k = 0; k < 20 && (await page.locator('.vo').count()); k++) {
      await page
        .locator('.vo-hit')
        .click({ force: true })
        .catch(() => {});
      await page.waitForTimeout(450); // 400ms 內的連點會被當成防抖吃掉
    }
  });
  // #149 起：自動結束的詰問先停在筆錄，多一顆「休庭」，按了才到休庭頁。
  await page.addLocatorHandler(
    page.getByRole('button', { name: '休庭', exact: true }),
    async () => {
      const ctx = (
        (await page
          .locator('main')
          .innerText()
          .catch(() => '')) || ''
      )
        .replace(/\s+/g, ' ')
        .slice(-160);
      appendFileSync('/tmp/qa-recess.txt', `休庭鈕：…${ctx}\n`);
      await page
        .getByRole('button', { name: '休庭', exact: true })
        .click()
        .catch(() => {});
    },
    { noWaitAfter: true },
  );
  await page.addInitScript(() => {
    const w = window as unknown as { __lineFails: unknown[]; __lineChecked: number };
    w.__lineFails = [];
    w.__lineChecked = 0;
    const norm = (t: string) => t.replace(/^›\s*/, '').replace(/[｜\s]/g, '');
    const textWithoutButtons = () => {
      const m = document.querySelector('main');
      if (!m) return '';
      const c = m.cloneNode(true) as HTMLElement;
      c.querySelectorAll('button, [role=group], nav, aside').forEach((x) => x.remove());
      return norm(c.textContent || '');
    };
    const pending: { kind: string; label: string; raw: string; scene: string; at: number }[] = [];
    const sweep = () => {
      if (!pending.length) return;
      const txt = textWithoutButtons();
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i];
        if (txt.includes(p.label)) pending.splice(i, 1);
        else if (Date.now() - p.at > 4000) {
          w.__lineFails.push({ kind: p.kind, label: p.raw, scene: p.scene });
          pending.splice(i, 1);
        }
      }
    };
    new MutationObserver(sweep).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    setInterval(sweep, 500);
    document.addEventListener(
      'click',
      (e) => {
        const b = (e.target as HTMLElement).closest('button');
        const main = b?.closest('main');
        if (!b || !main) return;
        let kind = '';
        if (b.closest('.choices[role=group]')) kind = '對話選項';
        else if (b.closest('.replies[role=group]')) kind = '手機回覆';
        else if (
          main.querySelector('.meter') &&
          main.querySelector('[role=tab]') &&
          b.classList.contains('wide')
        )
          kind = /施壓/.test(
            (main.querySelector('[role=tab][aria-selected=true]') as HTMLElement)?.innerText || '',
          )
            ? '會見施壓'
            : '會見問話';
        if (!kind) return;
        const scene = ((main.querySelector('.eyebrow, h2') as HTMLElement)?.innerText || '').slice(
          0,
          40,
        );
        const group = b.parentElement?.closest('.choices, .replies, ul') ?? b.parentElement;
        const empties = [...(group?.querySelectorAll('button') ?? [])].filter(
          (x) => !norm((x as HTMLElement).innerText),
        );
        if (empties.length)
          w.__lineFails.push({ kind: kind + '（空白選項）', label: `${empties.length} 個`, scene });
        const label = norm(b.innerText);
        if (!label) return;
        w.__lineChecked++;
        pending.push({ kind, label, raw: b.innerText.trim(), scene, at: Date.now() });
      },
      true,
    );
  });
}

export async function lineResult(page: Page) {
  await page.waitForTimeout(4300);
  return page
    .evaluate(() => {
      const w = window as unknown as { __lineFails: LineFail[]; __lineChecked: number };
      return { fails: w.__lineFails ?? [], checked: w.__lineChecked ?? 0 };
    })
    .catch(() => ({ fails: [] as LineFail[], checked: 0 }));
}
