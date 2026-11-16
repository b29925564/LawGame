// 從 Playwright 的 JSON 報告挑出「C 級」註記：第二、三級組合（英文、125／150%、360、320）和
// 第一級其他尺寸的名稱毛病，照跑不擋，結果交給 ci.yml 的 tier23 工作開成 C 級 Issue（process-v2 第 5 節第 8 項）。
// 用法：node scripts/ci/tier23.mjs pw-json/report.json
// 每一組（檔案 › 組合）印一行 JSON：{ key, file, items: [ "<測試標題>：<註記>" ] }。
import { existsSync, readFileSync } from 'node:fs';

const [file] = process.argv.slice(2);
if (!file || !existsSync(file)) process.exit(0);
const report = JSON.parse(readFileSync(file, 'utf8'));
const groups = new Map();

function walk(suite, path) {
  const here = suite.title && !suite.file?.endsWith(suite.title) ? [...path, suite.title] : path;
  for (const s of suite.suites ?? []) walk(s, here);
  for (const spec of suite.specs ?? [])
    for (const t of spec.tests ?? [])
      for (const r of t.results ?? [])
        for (const a of r.annotations ?? t.annotations ?? []) {
          if (a.type !== 'C 級') continue;
          const key = `${spec.file} › ${here.join(' › ')}`;
          if (!groups.has(key)) groups.set(key, { key, file: spec.file, items: new Set() });
          groups.get(key).items.add(`${spec.title}：${a.description}`);
        }
}

for (const s of report.suites ?? []) walk(s, []);
for (const g of groups.values()) console.log(JSON.stringify({ ...g, items: [...g.items].sort() }));
