import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { carryOver, followingEpisode, sceneOf, useEpisode } from '../game';

describe('接續下一集', () => {
  const ended = {
    episode: 'ep1',
    scene: episodes.ep1.scenes.length,
    step: 0,
    choices: {},
    cards: ['x'],
    flags: ['ethan-letter'],
    ethics: ['coach'],
    scenes: { 'some-desk': { flags: ['motion-denied'] } },
  };

  it('第 1 集之後是第 2 集，最後一集沒有下一集', () => {
    expect(followingEpisode(ended)).toBe('ep2');
    expect(followingEpisode({ ...ended, episode: 'ep2' })).toBeNull();
  });

  it('對話旗標與倫理紀錄帶過去，場景狀態與卡片不帶', () => {
    const p = carryOver(ended, 'ep2');
    expect(p.episode).toBe('ep2');
    expect(p.scene).toBe(0);
    expect(p.cards).toEqual([]);
    expect(p.scenes).toEqual({});
    expect(p.flags).toContain('ethan-letter');
    expect(p.flags).not.toContain('motion-denied');
    expect(p.ethics).toEqual(['coach']);
  });

  it('演完才能接續；開新遊戲可以指定集數', () => {
    useEpisode.setState({ progress: { ...ended, scene: 0 } });
    useEpisode.getState().nextEpisode();
    expect(useEpisode.getState().progress.episode).toBe('ep1');
    useEpisode.setState({ progress: ended });
    expect(sceneOf(ended)).toBeNull();
    useEpisode.getState().nextEpisode();
    expect(useEpisode.getState().progress.episode).toBe('ep2');
    useEpisode.getState().newGame('ep2');
    expect(useEpisode.getState().progress).toMatchObject({ episode: 'ep2', scene: 0 });
    useEpisode.getState().newGame('nope');
    expect(useEpisode.getState().progress.episode).toBe('ep1');
  });
});
