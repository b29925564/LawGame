import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
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
      const schema = id.endsWith('proto.yaml') ? caseSchema : episodeSchema;
      const data = schema.parse(parse(readFileSync(id, 'utf8')));
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(data))});`;
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
  test: {
    include: ['src/**/*.test.ts'],
  },
});
