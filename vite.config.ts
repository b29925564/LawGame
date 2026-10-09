import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin as CssPlugin } from 'postcss';
import { parse } from 'yaml';
import { z } from 'zod';
import { episodeSchema } from './src/engine/episode/schema';
import { caseSchema } from './src/engine/schema';

/** 建置時解析並驗證劇本 YAML，瀏覽器端不再打包 yaml 與 zod。 */
function content(): Plugin {
  return {
    name: 'lawgame-content',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('.yaml')) return;
      if (/[\\/]content[\\/]en[\\/]/.test(id)) {
        // 英文對照表：中文原句 → 英文。空檔就是空表。
        const map = z.record(z.string(), z.string()).parse(parse(readFileSync(id, 'utf8')) ?? {});
        return `export default JSON.parse(${JSON.stringify(JSON.stringify(map))});`;
      }
      if (id.endsWith('rigs.yaml')) {
        // 燈組：場記右欄讀的 label、time、kelvin。
        const rig = z.object({
          label: z.string(),
          time: z.string().regex(/^\d{2}:\d{2}$/),
          kelvin: z.number().int(),
        });
        const rigs = z.record(z.string(), rig).parse(parse(readFileSync(id, 'utf8')));
        return `export default JSON.parse(${JSON.stringify(JSON.stringify(rigs))});`;
      }
      const schema = id.endsWith('proto.yaml') ? caseSchema : episodeSchema;
      const data = schema.parse(parse(readFileSync(id, 'utf8')));
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(data))});`;
    },
  };
}

/**
 * 減少動態有兩個來源（設定集 10.6）：系統的 prefers-reduced-motion，和選項頁存在 <html data-reduced-motion> 的玩家設定。
 * 樣式照舊寫 @media (prefers-reduced-motion: reduce | no-preference)，建置時每個區塊改寫成兩個來源都認：
 * - 原區塊多一個條件「玩家沒有反過來設定」（reduce 區塊：data-reduced-motion 不是 '0'）；
 * - 區塊外再放一份給玩家自己設定的情況（reduce 區塊：data-reduced-motion 是 '1'），不看系統。
 * 條件包在 :where() 裡，不改原本的權重；區塊裡的 @keyframes 搬到區塊外，兩份都用得到。
 */
function reducedMotionCss(): CssPlugin {
  const query = /\(\s*prefers-reduced-motion\s*:\s*(reduce|no-preference)\s*\)/;
  const guard = (selector: string, cond: string) => {
    const head = /^(html|:root)(?![\w-])/.exec(selector)?.[1];
    return head
      ? `${head}:where(${cond})${selector.slice(head.length)}`
      : `:where(html${cond}) ${selector}`;
  };
  return {
    postcssPlugin: 'lawgame-reduced-motion',
    OnceExit(root) {
      root.walkAtRules('media', (media) => {
        const kind = query.exec(media.params)?.[1];
        if (!kind) return;
        const [keep, own] = kind === 'reduce' ? ['0', '1'] : ['1', '0'];
        media.walkAtRules(/keyframes$/i, (frames) => {
          frames.remove();
          media.before(frames);
        });
        const rest = media.params
          .replace(query, '')
          .replace(/^\s*and\s+|\s+and\s*$/g, '')
          .trim();
        const copy = media.clone();
        media.walkRules((rule) => {
          rule.selectors = rule.selectors.map((s) =>
            guard(s, `:not([data-reduced-motion='${keep}'])`),
          );
        });
        copy.walkRules((rule) => {
          rule.selectors = rule.selectors.map((s) => guard(s, `[data-reduced-motion='${own}']`));
        });
        if (rest) {
          copy.params = rest;
          media.after(copy);
        } else {
          media.after(copy.nodes);
        }
      });
    },
  };
}

/** 標題畫面角落的建置標記：commit 短碼與建置時間（台北時間），分辨快取到的舊頁面。 */
function build() {
  let sha = 'dev';
  try {
    sha = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    // 沒有 git 的環境（例如解壓的原始碼）就標 dev。
  }
  const at = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16);
  return { sha, at };
}

export default defineConfig({
  plugins: [content(), react()],
  define: { __BUILD__: JSON.stringify(build()) },
  css: { postcss: { plugins: [reducedMotionCss()] } },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
