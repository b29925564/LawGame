import { bibleViolations } from './bible';
import { installExtra } from './extra';
import { installLineCheck, lineResult } from './linecheck';
import { expect as expectLines, test } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';
import { play, log, type Opts } from './playx';

const routes: Record<string, Opts> = {
  'R1 瑞秋線全勝': { theory: 'rachel', rosa: true, impeach: true },
  'R2 蘇菲線': { theory: 'sophie', rosa: true, impeach: true },
  'R6 拿到論點 I 仍選蘇菲': { theory: 'sophie', rosa: true, jade: true, impeach: true },
  'R3 走錯（傳票被駁回）＋撤回傳票': {
    theory: 'doubt',
    withdrawChat: true,
    mistakes: true,
    impeach: true,
    bluff: true,
  },
  'R4 瑞秋線但庭上不彈劾': { theory: 'rachel', impeach: false },
  'R7 論點齊全但不彈劾、不許承諾（僵局）': {
    theory: 'sophie',
    rosa: true,
    impeach: false,
    noPromise: true,
  },
  'R5 合理懷疑線＋虛張聲勢': { theory: 'doubt', impeach: true, bluff: true },
};

for (const [name, o] of Object.entries(routes)) {
  test(name, async ({ page }, info) => {
    bibleViolations.length = 0;
    const dir = `/tmp/qa-shots/${info.project.name}/${name.split(' ')[0]}`;
    mkdirSync(dir, { recursive: true });
    log.length = 0;
    try {
      await installExtra(page);
      await installLineCheck(page);
      await play(page, { ...o, shots: dir });
      const lr = await lineResult(page);
      for (const f of lr.fails) log.push(`[台詞沒出現] ${f.kind}｜${f.scene}｜${f.label}`);
      log.push(`[台詞檢查] 檢查 ${lr.checked} 句，缺 ${lr.fails.length} 句`);
      expectLines(lr.fails.map((f) => `${f.kind}｜${f.label}`)).toEqual([]);
      // BIBLE=1（CI 的 routes 工作）時，設定集稽核的違規也要是空的。
      expectLines.soft(bibleViolations, '設定集稽核').toEqual([]);
    } finally {
      appendFileSync('/tmp/qa-log.txt', `\n## [${info.project.name}] ${name}\n${log.join('\n')}\n`);
    }
  });
}
