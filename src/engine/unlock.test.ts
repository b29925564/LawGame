import { describe, expect, it } from 'vitest';
import { atEpisodeEnd, episodeOf, newGameEpisodes, useEpisode } from './game';
import { cleanSettings } from './settings';

describe('新遊戲能選的集（#442）', () => {
  it('第一次玩只有第 1 集', () => {
    expect(newGameEpisodes({})).toEqual(['ep1']);
    expect(newGameEpisodes({}, [undefined, undefined])).toEqual(['ep1']);
  });
  it('第 1 集走到結局後，第 2 集出現', () => {
    expect(newGameEpisodes({ ep1: true })).toEqual(['ep1', 'ep2']);
  });
  it('手上已有第 2 集的存檔（之前就玩到了）也列出來', () => {
    expect(newGameEpisodes({}, ['ep2'])).toEqual(['ep1', 'ep2']);
  });
  it('設定讀回時 cleared 逐欄檢查，壞值丟掉', () => {
    expect(cleanSettings({ cleared: { ep1: true, ep2: 'x' } }).cleared).toEqual({ ep1: true });
    expect(cleanSettings({ cleared: [1] }).cleared).toEqual({});
  });
});

describe('走到集尾', () => {
  it('開頭不是集尾，停在最後一張卡上是', () => {
    useEpisode.getState().newGame('ep1');
    const p = useEpisode.getState().progress;
    expect(atEpisodeEnd(p)).toBe(false);
    const n = episodeOf(p).scenes.length;
    expect(atEpisodeEnd({ ...p, scene: n - 1 })).toBe(episodeOf(p).scenes[n - 1].type === 'card');
    expect(atEpisodeEnd({ ...p, scene: n })).toBe(true);
    useEpisode.getState().toTitle();
  });
});
