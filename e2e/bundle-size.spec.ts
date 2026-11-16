import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

/**
 * 主程式大小上限（Issue #388 P3）：打開網頁就要載的 JS（入口 index-*.js 加上它靜態 import 的 chunk）。
 * 11-16 把大場景改成延遲載入後是 720 KB（gzip 約 240 KB）；以前全部塞在主程式裡是 1001 KB（gzip 331 KB）。
 * 上限留一點成長空間。要調高請先看是不是又有大東西被主程式靜態 import 進來（例如場景元件直接 import，而不是走 src/ui/lazyScenes.tsx）。
 */
const LIMIT_KB = 800;
const LIMIT_GZIP_KB = 270;

// eslint-disable-next-line no-empty-pattern -- 不需要瀏覽器，只讀 dist
test('打開網頁就要載的 JS 不超過上限', ({}, info) => {
  test.skip(info.project.name !== 'desktop', '量一次就好');
  const dir = new URL('../dist/assets/', import.meta.url);
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const entry = html.match(/<script type="module"[^>]*src="[^"]*\/assets\/([^"]+\.js)"/)![1];
  const seen = new Set<string>();
  const walk = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const code = readFileSync(new URL(name, dir), 'utf8');
    // 只算靜態 import；import("./x.js") 是延遲載入，不算。
    for (const m of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) walk(m[1]);
  };
  walk(entry);
  const files = [...seen];
  expect(files.every((f) => readdirSync(dir).includes(f))).toBe(true);
  const bytes = files.map((f) => readFileSync(new URL(f, dir)));
  const kb = bytes.reduce((n, b) => n + b.length, 0) / 1024;
  const gz = bytes.reduce((n, b) => n + gzipSync(b).length, 0) / 1024;
  console.log(`主程式 ${files.join(' + ')}：${kb.toFixed(0)} KB（gzip ${gz.toFixed(0)} KB）`);
  expect(kb, files.join(', ')).toBeLessThan(LIMIT_KB);
  expect(gz, files.join(', ')).toBeLessThan(LIMIT_GZIP_KB);
});
