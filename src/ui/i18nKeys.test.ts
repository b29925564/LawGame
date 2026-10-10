import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { episodes } from '../content';
import { END_TITLE, saveLabel } from '../engine/game';
import { readSave } from '../engine/save';
import { install, reset, translate } from '../i18n';

const dir = new URL('../content/en/', import.meta.url);
const all: Record<string, string> = Object.assign(
  {},
  ...readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parse(readFileSync(new URL(f, dir), 'utf8')) ?? {}),
);

describe('英文對照表的樣板', () => {
  afterAll(reset);

  it('兩個佔位符不能相鄰：中間沒有固定字，任何字串都會被拆開', () => {
    const bad = Object.keys(all).filter((k) => /\}\{/.test(k));
    expect(bad).toEqual([]);
  });

  it('查不到的中文、已經是英文的字串都原樣回傳', () => {
    reset();
    install(all);
    for (const s of ['查無此句', '星期五下午', 'Let him talk.', 'Court system', 'Present'])
      expect(translate(s)).toBe(s);
  });

  it('存檔標籤（「第 1 集・第四幕」）每一場都有英文：標題的「繼續」和存檔欄都用它', () => {
    reset();
    install(all);
    const left = Object.entries(episodes).flatMap(([episode, ep]) =>
      ep.scenes.map((_, scene) => {
        const p = { episode, scene, step: 0, choices: {}, cards: [], scenes: {} };
        return translate(saveLabel(p));
      }),
    );
    expect([...new Set(left.filter((x) => /[\u3400-\u9fff]/.test(x)))]).toEqual([]);
  });

  it('集尾卡的存檔標籤不重複集數；舊存檔讀回來也修好', () => {
    for (const [episode, ep] of Object.entries(episodes)) {
      const last = ep.scenes.length - 1;
      for (let scene = 0; scene <= ep.scenes.length; scene++) {
        const label = saveLabel({ episode, scene, step: 0, choices: {}, cards: [], scenes: {} });
        const n = `第 ${ep.number} 集`;
        expect(label.split('・')[1]).not.toBe(n);
        // 演完最後一場：集尾畫面的標題（App.tsx 的 headline）是同一個字，兩集一致。
        if (scene === ep.scenes.length) expect(label).toBe(`${n}・${END_TITLE}`);
        if (scene >= last && ep.scenes[last].type === 'card' && ep.scenes[last].act === n)
          expect(label).toBe(`${n}・待續`);
      }
    }
    const store = new Map<string, string>([
      [
        'lawgame-ep-auto',
        JSON.stringify({
          version: 5,
          savedAt: 1,
          label: '第 1 集・第 1 集',
          progress: {
            episode: 'ep1',
            scene: 45,
            step: 0,
            choices: {},
            cards: [],
            flags: [],
            ethics: [],
            scenes: {},
          },
        }),
      ],
    ]);
    const storage = { getItem: (k: string) => store.get(k) ?? null } as Storage;
    expect(readSave('auto', storage)?.label).toBe('第 1 集・待續');
  });
});
