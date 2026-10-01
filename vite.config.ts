import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { parse } from 'yaml';
import { episodeSchema } from './src/engine/episode/schema';
import { caseSchema } from './src/engine/schema';

/** 建置時解析並驗證劇本 YAML，瀏覽器端不再打包 yaml 與 zod。 */
function content(): Plugin {
  return {
    name: 'lawgame-content',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('.yaml')) return;
      const schema = id.endsWith('proto.yaml') ? caseSchema : episodeSchema;
      const data = schema.parse(parse(readFileSync(id, 'utf8')));
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(data))});`;
    },
  };
}

export default defineConfig({
  plugins: [content(), react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
