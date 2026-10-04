import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import { migrate, readSave, SAVE_VERSION, writeSave, type Progress } from './save';

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

const ep1 = episodes.ep1.scenes;
const indexOf = (id: string) => ep1.findIndex((s) => s.id === id);
const phone = ep1.findIndex((s) => s.type === 'phone');
const phoneSteps = (ep1[phone] as { steps: { do: string }[] }).steps;
const choose = phoneSteps.findIndex((s) => s.do === 'choose');

const progress: Progress = {
  episode: 'ep1',
  scene: phone,
  step: choose,
  choices: { [`${ep1[phone].id}:${choose}`]: 0 },
  cards: ['autopsy'],
  flags: ['x'],
  ethics: [],
  scenes: {},
};
const file = (p: object, extra: object = {}) => ({
  version: SAVE_VERSION,
  savedAt: 1,
  label: '第 1 集・片頭',
  progress: { ...progress, ...p },
  ...extra,
});
const read = (raw: unknown) => {
  const s = memory();
  s.setItem('lawgame-ep-auto', JSON.stringify(raw));
  return readSave('auto', s);
};

describe('存檔檢查', () => {
  it('完好的存檔寫入後讀得回來，並記下場景 id', () => {
    const s = memory();
    expect(writeSave('auto', '第 1 集・片頭', progress, s)).toBe(true);
    const f = readSave('auto', s);
    expect(f).toMatchObject({ version: SAVE_VERSION, sceneId: ep1[phone].id, progress });
  });

  it.each([
    ['卡片是 null', { cards: null }],
    ['卡片不是字串', { cards: [1] }],
    ['選擇是 null', { choices: null }],
    ['選擇的值不是數字', { choices: { a: 'x' } }],
    ['旗標不是陣列', { flags: 'x' }],
    ['倫理紀錄是 null', { ethics: null }],
    ['場景狀態是字串', { scenes: { 'meet-ethan': 'x' } }],
    ['場景狀態是陣列', { scenes: { 'meet-ethan': [] } }],
    ['場景狀態是 null', { scenes: { 'meet-ethan': null } }],
    ['場景表是 null', { scenes: null }],
    ['陣列欄位不是陣列', { scenes: { [ep1[indexOf('plea-morrow')].id]: { log: 'x' } } }],
    ['場景是負數', { scene: -1 }],
    ['場景不是整數', { scene: 1.5 }],
    ['步數是字串', { step: '0' }],
    ['不認得的集數', { episode: 'ep9' }],
    ['原型鏈上的鍵', { episode: 'constructor' }],
    ['場景超過一集的長度', { scene: ep1.length + 1 }],
  ])('%s的存檔當作沒有', (_, p) => {
    expect(read(file(p))).toBeNull();
  });

  it('標籤或時間壞掉的存檔當作沒有', () => {
    expect(read(file({}, { label: null }))).toBeNull();
    expect(read(file({}, { savedAt: 'x' }))).toBeNull();
    expect(read(file({}, { sceneId: 3 }))).toBeNull();
  });

  it('舊存檔少了較新的欄位不算壞', () => {
    const id = 'plea-morrow';
    expect(
      read(file({ scene: indexOf(id), step: 0, choices: {}, scenes: { [id]: {} } })),
    ).not.toBeNull();
    expect(read(file({ flags: undefined, ethics: undefined }))?.progress.flags).toEqual([]);
  });

  it('演完的一集（場景＝場景數）照樣讀得回來', () => {
    const f = read(file({ scene: ep1.length, step: 0, choices: {} }));
    expect(f?.progress.scene).toBe(ep1.length);
  });

  it('劇本增刪場景後，靠場景 id 找回原本的場景', () => {
    const at = indexOf('plea-morrow');
    const f = read(file({ scene: at - 2, step: 0, choices: {} }, { sceneId: 'plea-morrow' }));
    expect(f?.progress.scene).toBe(at);
    // id 已經不存在就沿用原索引。
    expect(read(file({ step: 0 }, { sceneId: 'gone' }))?.progress.scene).toBe(phone);
  });

  it('電話場景的步數超出範圍時夾回最後一步', () => {
    const f = read(file({ step: 999, choices: {} }));
    expect(f?.progress.step).toBe(phoneSteps.length - 1);
  });

  it('超出選項範圍或不是選擇步的選擇丟掉', () => {
    const id = ep1[phone].id;
    const f = read(
      file({
        choices: {
          [`${id}:${choose}`]: 99,
          [`${id}:999`]: 0,
          [`${id}:${choose === 0 ? 1 : 0}`]: 0,
        },
      }),
    );
    expect(f?.progress.choices).toEqual({});
    const ok = read(file({}));
    expect(ok?.progress.choices).toEqual(progress.choices);
  });

  it('第 1～4 版的舊存檔遷移後照樣讀得回來', () => {
    const base = { episode: 'ep1', scene: 0, step: 0, choices: {} };
    const v1 = { version: 1, savedAt: 1, label: 'x', progress: base };
    const rest = { ...base, cards: [], scenes: {} };
    for (const old of [
      v1,
      { version: 2, savedAt: 1, label: 'x', progress: rest },
      { version: 3, savedAt: 1, label: 'x', progress: rest },
      { version: 4, savedAt: 1, label: 'x', progress: rest },
    ]) {
      const f = migrate(old);
      expect(f?.version).toBe(SAVE_VERSION);
      expect(f?.progress).toMatchObject({ flags: [], ethics: [], cards: [], scenes: {} });
    }
  });
});
