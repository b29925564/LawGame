import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parse } from 'yaml';

/**
 * 遴選：有因迴避被駁回後，沒有新的提問就不能再對同一人聲請（Issue #386 C8）。
 * 按鈕停用期間，人物卡名字那一行右邊蓋聲請被駁回時用的同一個「駁回」章，不壓剪影、不壓名字和職業；
 * 問過他之後按鈕恢復、章拿掉（設計師 #393）。桌機 1440、手機 390。
 */
const ep1 = parse(readFileSync('src/content/ep1.yaml', 'utf8')) as { scenes: { id: string }[] };
const scene = ep1.scenes.findIndex((s) => s.id === 'voir-dire');

test('駁回後按鈕停用、名字旁蓋駁回章；問過之後恢復', async ({ page }, info) => {
  const phone = info.project.name !== 'desktop';
  await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate((scene) => {
    localStorage.setItem('lawgame-lang', 'zh');
    localStorage.setItem(
      'lawgame-ep-auto',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        label: 'x',
        progress: {
          episode: 'ep1',
          scene,
          step: 0,
          choices: {},
          cards: [],
          flags: [],
          ethics: [],
          scenes: {
            'voir-dire': {
              left: 6,
              asked: [],
              struck: [],
              theirs: [],
              excused: [],
              wrong: 0,
              seated: null,
            },
          },
        },
      }),
    );
  }, scene);
  await page.reload();
  await page.getByRole('button', { name: /^繼續/ }).first().click();
  const start = page.getByRole('button', { name: '開始遴選' });
  await start.or(page.locator('button.cand').first()).first().waitFor();
  if (await start.isVisible()) await start.click();
  await page.locator('button.cand').filter({ hasText: '華特・班奈特' }).click();

  const prof = page.locator('.prof');
  const cause = prof.getByRole('button', { name: '聲請有因迴避' });
  const stamp = prof.locator('.prof-name .stamp');
  await expect(stamp).toHaveCount(0);
  await cause.click();
  await expect(cause).toBeDisabled();
  await expect(stamp).toBeVisible();
  await expect(stamp).toHaveAccessibleName('駁回');

  // 章不壓剪影、不壓名字和職業那一行。
  const box = await prof.evaluate((p) => {
    const r = (sel: string) => p.querySelector(sel)!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(p.querySelector('.prof-name h3')!);
    const name = range.getBoundingClientRect();
    return {
      stamp: r('.prof-name .stamp'),
      photo: r('.silcard, .idphoto'),
      name,
      sub: r('.sub'),
      card: p.getBoundingClientRect(),
    };
  });
  const apart = (a: DOMRect, b: DOMRect) =>
    a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
  const info2 = JSON.stringify(box);
  expect(apart(box.stamp, box.photo), info2).toBe(true);
  expect(apart(box.stamp, box.name), info2).toBe(true);
  expect(apart(box.stamp, box.sub), info2).toBe(true);
  // 章轉 2°，角會多出不到 1 px。
  expect(box.stamp.right, info2).toBeLessThanOrEqual(box.card.right + 1);
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/denied-${phone ? 390 : 1440}.png` });

  // 問過之後：按鈕恢復，章拿掉。
  await prof.getByRole('button', { name: /^提問/ }).click();
  await expect(cause).toBeEnabled();
  await expect(stamp).toHaveCount(0);
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/asked-${phone ? 390 : 1440}.png` });
});
