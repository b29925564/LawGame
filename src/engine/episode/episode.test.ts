import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { migrate, readSave, writeSave, SAVE_VERSION } from '../save';
import type * as desk from './desk';
import { canAdvance, lastStep, phoneView, photosStep } from './phone';
import { lineSchema, type Episode, type PhoneScene } from './schema';
import { validateEpisode } from './validate';

const cold = episodes.ep1.scenes[0] as PhoneScene;
const stepOf = (what: string) => cold.steps.findIndex((s) => s.do === what);

describe('冷開場的手機畫面', () => {
  it('通知點開前不算進聊天室', () => {
    const v = phoneView(cold, stepOf('notify'), {});
    expect(v.screen).toBe('lock');
    expect(v.threads['葛蘭特・沃斯']).toBeUndefined();
  });

  it('回覆前不能往下，回覆後出現在同一個聊天室', () => {
    const i = stepOf('choose');
    expect(canAdvance(cold, i, {})).toBe(false);
    expect(canAdvance(cold, i, { [i]: 0 })).toBe(true);
    const v = phoneView(cold, i, { [i]: 2 });
    expect(v.chosen).toBe(2);
    expect(v.threads['葛蘭特・沃斯'].map((b) => b.mine)).toEqual([false, true]);
  });

  it('收回後訊息還在原位，但標成已收回', () => {
    const v = phoneView(cold, stepOf('retract'), { [stepOf('choose')]: 0 });
    expect(v.screen).toBe('chat');
    expect(v.thread).toBe('葛蘭特・沃斯');
    expect(v.threads['葛蘭特・沃斯'][0]).toMatchObject({ id: 'summons', retracted: true });
    expect(v.threads['葛蘭特・沃斯'][1]).toMatchObject({ mine: true, retracted: false });
  });

  it('演完最後一步還有一頁警方現場照片（P2-6b），之後才換場', () => {
    expect(photosStep(cold)).toBe(cold.steps.length);
    expect(lastStep(cold)).toBe(cold.steps.length);
    expect(canAdvance(cold, cold.steps.length, {})).toBe(true);
    expect(cold.photos?.map((p) => p.photo.bates)).toEqual([
      'CPD-000301',
      'CPD-000302',
      'CPD-000303',
    ]);
    const bare = { ...cold, photos: undefined };
    expect(photosStep(bare)).toBeUndefined();
    expect(lastStep(bare)).toBe(cold.steps.length - 1);
  });

  it('不管怎麼回司機，伊森都說出了奧瑪之後會作證的那句話', () => {
    const i = cold.steps.findIndex((s) => s.do === 'choose' && s.mode === 'talk');
    for (const pick of [0, 1]) {
      const v = phoneView(cold, i, { [i]: pick });
      expect(v.talk.some((l) => l.who === '伊森' && l.text.includes('私下解決'))).toBe(true);
    }
  });
});

describe('劇本驗證器（集數）', () => {
  const bad: Episode = {
    id: 'bad',
    number: 9,
    title: '壞劇本',
    counsel: '莫羅檢察官',
    effects: [],
    scenes: [
      {
        type: 'phone',
        id: 'a',
        act: '測試',
        owner: '某人',
        epilogue: false,
        steps: [
          { do: 'caption', time: '23:00', text: '晚' },
          { do: 'caption', time: '22:00', text: '時間倒流' },
          { do: 'retract', target: 'ghost' },
        ],
      },
      { type: 'card', id: 'a', act: '測試', title: '重複', lines: [], epilogue: false },
    ],
  };
  it('抓出時間倒流、收回不存在的訊息、場景 id 重複', () => {
    const errors = validateEpisode(bad).join('\n');
    expect(errors).toContain('早於前一步');
    expect(errors).toContain('ghost');
    expect(errors).toContain('場景 id 重複');
  });
});

describe('存檔', () => {
  const memory = (): Storage => {
    const m = new Map<string, string>();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
      clear: () => m.clear(),
      key: () => null,
      length: 0,
    };
  };
  const progress = {
    episode: 'ep1',
    scene: 0,
    step: 3,
    choices: { 'cold-open:3': 1 },
    cards: [],
    scenes: {},
  };

  it('寫入後讀得回來', () => {
    const s = memory();
    expect(writeSave(2, '第 1 集・冷開場', progress, s)).toBe(true);
    expect(readSave(2, s)).toMatchObject({ version: SAVE_VERSION, progress });
    expect(readSave(1, s)).toBeNull();
  });

  it('第 1 版的存檔補上新欄位後照樣讀得回來', () => {
    const old = {
      version: 1,
      savedAt: 1,
      label: '第 1 集・冷開場',
      progress: { episode: 'ep1', scene: 0, step: 3, choices: {} },
    };
    const f = migrate(old);
    expect(f).toMatchObject({ version: SAVE_VERSION });
    expect(f?.progress.cards).toEqual([]);
    expect(f?.progress.scenes).toEqual({});
  });

  it('第 2 版的桌面存檔補上時間線', () => {
    const old = {
      version: 2,
      savedAt: 1,
      label: '第 1 集・第二幕',
      progress: {
        episode: 'ep1',
        scene: 7,
        step: 0,
        choices: {},
        cards: [],
        scenes: { investigate: { hours: 20, spent: 4, marked: [] } },
      },
    };
    const f = migrate(old);
    expect(f?.version).toBe(SAVE_VERSION);
    expect((f?.progress.scenes.investigate as { timeline: string[] }).timeline).toEqual([]);
    expect((f?.progress.scenes.investigate as { hours: number }).hours).toBe(20);
  });

  it('第 3 版的推理鏈草稿清空，已確認的疑問保留', () => {
    const old = {
      version: 3,
      savedAt: 1,
      label: '第 1 集・第二幕',
      progress: {
        episode: 'ep1',
        scene: 7,
        step: 0,
        choices: {},
        cards: [],
        scenes: {
          investigate: {
            hours: 20,
            confirmed: ['q1'],
            attempts: { q2: { cards: ['autopsy'], relation: '支持' } },
          },
        },
      },
    };
    const st = migrate(old)?.progress.scenes.investigate as desk.DeskState;
    expect(st.confirmed).toEqual(['q1']);
    expect(st.attempts).toEqual({});
    expect(st.found).toEqual([]);
    expect(st.link).toEqual({ cards: [], relation: null });
  });

  it('未來版本或壞掉的存檔不讀，也不讓遊戲當掉', () => {
    expect(migrate({ version: SAVE_VERSION + 1, progress })).toBeNull();
    expect(migrate('亂碼')).toBeNull();
    const s = memory();
    s.setItem('lawgame-ep-auto', '{不是 JSON');
    expect(readSave('auto', s)).toBeNull();
  });

  it('沒有儲存空間時回報失敗而不是丟例外', () => {
    const broken = {
      ...memory(),
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(writeSave('auto', 'x', progress, broken)).toBe(false);
  });
});

describe('台詞表情', () => {
  it('劇本可以標慌、默；沒標就是平；不認得的表情擋下來', () => {
    expect(lineSchema.parse({ who: '盧卡斯', text: '……', mood: '慌' }).mood).toBe('慌');
    expect(lineSchema.parse({ who: '盧卡斯', text: '……', mood: '默' }).mood).toBe('默');
    expect(lineSchema.parse({ who: '盧卡斯', text: '……' }).mood).toBe('平');
    expect(lineSchema.safeParse({ who: '盧卡斯', text: '……', mood: '怒' }).success).toBe(false);
  });
});
