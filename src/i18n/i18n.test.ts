import { afterEach, describe, expect, it } from 'vitest';
import { install, reset, setLang, t, translate, useLang } from '.';

afterEach(() => {
  reset();
  useLang.setState({ lang: 'zh' });
});

describe('雙語查表', () => {
  it('原句、場景覆寫、缺英文退回中文', () => {
    install({ 結束: 'The end.', 'closing::結束': 'Rest.' });
    expect(translate('結束')).toBe('The end.');
    expect(translate('結束', 'closing')).toBe('Rest.');
    expect(translate('結束', 'other')).toBe('The end.');
    expect(translate('還沒翻的句子')).toBe('還沒翻的句子');
  });

  it('樣板代入的值也會再查表', () => {
    install({ '辯方可以詰問{name}。': 'The defense may examine {name}.', 崔佛: 'Trevor' });
    expect(translate('辯方可以詰問崔佛。')).toBe('The defense may examine Trevor.');
    expect(translate('辯方可以詰問路人。')).toBe('The defense may examine 路人.');
  });

  it('頓號清單每一項都查得到才翻', () => {
    install({ 邏輯: 'Logic', 情感: 'Emotion' });
    expect(translate('邏輯、情感')).toBe('Logic, Emotion');
    expect(translate('邏輯、別的')).toBe('邏輯、別的');
  });

  it('中文模式原樣顯示；切到英文才載入英文檔', async () => {
    expect(t('誘導')).toBe('誘導');
    await setLang('en');
    expect(t('誘導')).toBe('Leading');
    expect(t('異議，傳聞。')).toBe('Objection, Hearsay.');
    await setLang('zh');
    expect(t('誘導')).toBe('誘導');
  });
});
