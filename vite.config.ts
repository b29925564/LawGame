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

/**
 * 內容安全政策（上線前審查 S2，Issue #380）：GitHub Pages 不能自訂回應標頭，只能用 <meta>。
 * 只在建置時加：開發伺服器的熱更新要跑行內腳本。字型還從 Google Fonts 載（自架見 #380 S3），放行那兩個網域。
 * 發布 Artifact 時 bundle.py 把主程式內嵌成行內腳本，會拿掉這一行（pipeline/publish/README.md）。
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'lawgame-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ],
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
  // GitHub Pages 在 /LawGame/ 子路徑下（pages.yml 設 BASE_PATH）；其他建置照舊用根路徑。
  base: process.env.BASE_PATH ?? '/',
  plugins: [content(), react(), csp()],
  define: { __BUILD__: JSON.stringify(build()) },
  css: { postcss: { plugins: [reducedMotionCss()] } },
  build: {
    // 場景延遲載入以後（Issue #388 P3），樣式仍然打包成一份：試玩連結的 bundle.py 只內嵌這一份，
    // 而且場景切換時不會因為晚到的 CSS 閃一下沒樣式。
    cssCodeSplit: false,
    // 動態載入不插 modulepreload：預載的路徑是從網站根目錄算的，放到試玩連結（不在根目錄）會 404，連帶整個場景載入失敗。
    // 場景的相依幾乎都在主程式一起載好了，少了預載只差一點點。
    modulePreload: false,
    // 音效用 fetch 載入：小於 4 KB 的檔若照預設內嵌成 data:，會被 CSP 的 connect-src 擋（設計師 #398 審查）。
    // 音檔一律輸出成檔案；其他資源照 Vite 預設。
    assetsInlineLimit: (file) => (/\.(m4a|mp3|ogg|wav)$/i.test(file) ? false : undefined),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
