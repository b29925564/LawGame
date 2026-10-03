import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { glossary } from './glossary';

describe('法典百科英文', () => {
  const en = parse(readFileSync(new URL('./en/glossary.yaml', import.meta.url), 'utf8')) as Record<
    string,
    string
  >;
  it('每個詞條的名稱、解釋、遊戲裡說明都有英文', () => {
    const missing = glossary.flatMap((g) =>
      [g.term, g.text, g.inGame].filter((s): s is string => !!s && !en[s]),
    );
    expect(missing).toEqual([]);
  });
  it('遊戲裡的說明不劇透另一集（不點名第 2 集的人物）', () => {
    const spoilers = ['赫克托', '費雪', '卡爾德快遞', '瑪莉索', '第 2 集'];
    const bad = glossary.filter((g) => spoilers.some((w) => g.inGame?.includes(w)));
    expect(bad.map((g) => g.term)).toEqual([]);
  });
});
