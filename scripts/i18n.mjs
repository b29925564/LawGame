// 雙語對照表的報告與重設 key。
//   node scripts/i18n.mjs            列出各集缺多少英文、哪些英文 key 已經對不上中文（只報告，不會失敗）
//   node scripts/i18n.mjs --missing  另外列出缺英文的句子
//   node scripts/i18n.mjs --rekey [--base origin/main]
//       拿 base 的中文和工作區的中文逐場比對，一對一被改寫的句子，把英文檔的 key 改成新句子並列出來請人複查。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isMap, parse, parseDocument } from 'yaml';

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';
const HAN = /[㐀-鿿]/;

/** 每一場依文件順序列出所有含中文的字串。 */
function scenesOf(text) {
  const out = new Map();
  const walk = (v, acc) => {
    if (typeof v === 'string') {
      if (HAN.test(v)) acc.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, acc));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, acc));
  };
  const data = parse(text) ?? {};
  const head = [];
  walk({ ...data, scenes: undefined }, head);
  out.set('', head);
  for (const s of data.scenes ?? []) {
    const acc = [];
    walk(s, acc);
    out.set(s.id, acc);
  }
  return out;
}

/** 最長共同子序列的對齊，回傳一對一被改寫的 [舊, 新]。 */
function rewrites(a, b) {
  const n = a.length;
  const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs = [];
  let i = 0;
  let j = 0;
  let da = [];
  let db = [];
  const flush = () => {
    if (da.length === db.length) da.forEach((x, k) => pairs.push([x, db[k]]));
    da = [];
    db = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      flush();
      i++;
      j++;
    } else if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) da.push(a[i++]);
    else db.push(b[j++]);
  }
  flush();
  return pairs;
}

const episodes = readdirSync('src/content')
  .filter((f) => /^ep\d+\.yaml$/.test(f))
  .map((f) => f.replace('.yaml', ''));

let renamed = 0;
for (const ep of episodes) {
  const enPath = `src/content/en/${ep}.yaml`;
  if (!existsSync(enPath)) {
    console.log(`${ep}: 沒有英文檔`);
    continue;
  }
  const zh = scenesOf(readFileSync(`src/content/${ep}.yaml`, 'utf8'));

  if (args.includes('--rekey')) {
    let old;
    try {
      old = scenesOf(
        execFileSync('git', ['show', `${base}:src/content/${ep}.yaml`], { encoding: 'utf8' }),
      );
    } catch {
      console.log(`${ep}: ${base} 沒有這一集，略過`);
      continue;
    }
    const doc = parseDocument(readFileSync(enPath, 'utf8'));
    const items = isMap(doc.contents) ? doc.contents.items : [];
    const has = (k) => items.some((p) => p.key.value === k);
    for (const [id, now] of zh) {
      for (const [before, after] of rewrites(old.get(id) ?? [], now)) {
        for (const [from, to] of [
          [before, after],
          [`${id}::${before}`, `${id}::${after}`],
        ]) {
          const pair = items.find((p) => p.key.value === from);
          if (!pair || has(to)) continue;
          pair.key.value = to;
          renamed++;
          console.log(
            `請複查 ${ep} ${id || '(開頭)'}\n  舊：${before}\n  新：${after}\n  英：${pair.value}`,
          );
        }
      }
    }
    if (renamed) writeFileSync(enPath, doc.toString({ lineWidth: 0 }));
  }

  const en = parse(readFileSync(enPath, 'utf8')) ?? {};
  const all = new Set([...zh.values()].flat());
  const stale = Object.keys(en).filter((k) => {
    const [id, text] = k.includes('::') ? k.split('::') : [null, k];
    return id ? !(zh.get(id) ?? []).includes(text) : !all.has(text);
  });
  const done = (s, id) => en[`${id}::${s}`] !== undefined || en[s] !== undefined;
  let total = 0;
  let missing = 0;
  for (const [id, list] of zh) {
    const gaps = [...new Set(list)].filter((s) => !done(s, id));
    total += new Set(list).size;
    missing += gaps.length;
    if (args.includes('--missing') && gaps.length) {
      console.log(`  ${id || '(開頭)'}：缺 ${gaps.length}`);
      for (const g of gaps) console.log(`    ${g}`);
    }
  }
  console.log(`${ep}: 英文 ${total - missing}/${total}，過期 key ${stale.length}`);
  for (const k of stale) console.log(`  過期：${k}`);
}
if (args.includes('--rekey')) console.log(renamed ? `改了 ${renamed} 個 key` : '沒有要改的 key');
