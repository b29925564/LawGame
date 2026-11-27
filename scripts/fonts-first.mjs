// 第一眼的字（Issue #380 S3，設計師 #462 審查）：標題畫面、片頭、冷開場整段實際顯示的字。
//   npx vite build && npx vite preview --port 4173 &
//   node scripts/fonts-first.mjs http://localhost:4173/
// 寫出 src/ui/fonts/first.txt，scripts/fonts.py 拿它把中文字型切成「首屏」小檔＋其餘：
// 玩家打開遊戲時只等首屏那一小份，不必等整個字重。少收了字只會讓首屏多載一份檔，不會畫錯字。
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = new URL('../src/ui/fonts/first.txt', import.meta.url);
const chars = new Set();

/** 畫面上的字：所有文字節點，加上 ::before／::after 的 content。 */
async function grab(page) {
  const text = await page.evaluate(() => {
    let s = document.body.textContent ?? '';
    for (const el of document.querySelectorAll('*'))
      for (const pseudo of ['::before', '::after']) {
        const c = getComputedStyle(el, pseudo).content;
        if (c && c !== 'none' && c !== 'normal') s += c.replace(/^"|"$/g, '');
      }
    return s;
  });
  for (const c of text) if (c.codePointAt(0) >= 0x20) chars.add(c);
}

// 本機的 Chromium 跟鎖定的 Playwright 版本對不上時，用 CHROMIUM=<路徑> 指定。
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  // 標題與片頭（片頭的字都在 DOM 裡，依時間淡入）。
  const intro = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  await intro.goto(url);
  await intro.getByRole('button', { name: '新遊戲' }).waitFor();
  await grab(intro);
  await intro.getByRole('button', { name: '新遊戲' }).click();
  await intro.waitForTimeout(3000);
  await grab(intro);
  await intro.close();

  // 冷開場整段，到集名卡為止（路線同 e2e/cold-open.spec.ts）。
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('rd.dev.intro', '0'));
  await page.goto(url);
  await page.getByRole('button', { name: '新遊戲' }).click();
  const ep1 = page.getByRole('button', { name: /^第 1 集/ });
  if (await ep1.isVisible()) await ep1.click();
  const step = async (action) => {
    await grab(page);
    await action();
    await page.waitForTimeout(300);
  };
  const next = () => step(() => page.getByRole('button', { name: '繼續' }).click());
  const press = (name) => step(() => page.getByRole('button', { name }).first().click());
  const beat = () => step(() => page.locator('.place-beat').click());
  await next();
  await next();
  await press(/^聊天 葛蘭特・沃斯/);
  await press('好。');
  await next();
  await press('叫車');
  await next();
  await press('嗯，算是吧。');
  await next();
  await next();
  await press('感應員工證');
  await press('推開門');
  await beat();
  for (let i = 0; i < 4; i++) await next();
  await beat();
  for (let i = 0; i < 5; i++) await next();
  await page.getByRole('heading', { name: '已收回的訊息' }).waitFor();
  await grab(page);
  await page.close();
}
await browser.close();

const list = [...chars].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
writeFileSync(out, list + '\n');
console.log(`首屏 ${chars.size} 字 → src/ui/fonts/first.txt`);
