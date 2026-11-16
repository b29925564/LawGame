// 從 Playwright 的 JSON 報告挑出「不穩定」的測試：第一次失敗、重跑才過（status: flaky）。
// 用法：node scripts/ci/flaky.mjs pw-json/report.json <工作名稱>
// 每個不穩定的測試印一行 JSON：{ key, title, file, line, project, job, error }。key 不含工作名稱，用來找同一條的 Issue。
import { existsSync, readFileSync } from 'node:fs';

const [file, job = ''] = process.argv.slice(2);
if (!file || !existsSync(file)) process.exit(0);
const report = JSON.parse(readFileSync(file, 'utf8'));
const strip = (s) => String(s ?? '').replace(/\x1b\[[0-9;]*m/g, '');

function* walk(suite, path) {
  const here = suite.title && !suite.file?.endsWith(suite.title) ? [...path, suite.title] : path;
  for (const s of suite.suites ?? []) yield* walk(s, here);
  for (const spec of suite.specs ?? [])
    for (const t of spec.tests ?? [])
      if (t.status === 'flaky') {
        const err = t.results.find((r) => r.status !== 'passed' && r.status !== 'skipped');
        const title = [...here, spec.title].join(' › ');
        yield {
          key: `${spec.file} › ${title}`,
          title,
          file: spec.file,
          line: spec.line,
          project: t.projectName,
          job,
          error: strip(err?.error?.message).split('\n').slice(0, 6).join('\n'),
        };
      }
}

for (const s of report.suites ?? []) for (const f of walk(s, [])) console.log(JSON.stringify(f));
