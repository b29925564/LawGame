import { afterEach, describe, expect, it } from 'vitest';
import { install, money, reset, setLang, t, translate, useLang } from '.';

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

  it('英文句中的代入值可以要求小寫：{name:lower}', () => {
    install({ '異議，{reason}。': 'Objection, {reason:lower}.', 傳聞: 'Hearsay' });
    expect(translate('異議，傳聞。')).toBe('Objection, hearsay.');
    useLang.setState({ lang: 'en' });
    install({ '主張{v}': 'argues for {v:lower}' });
    expect(t('主張{v}', { v: 'Not guilty' })).toBe('argues for not guilty');
  });

  it('樣板代入的值也會再查表', () => {
    install({ '辯方可以詰問{name}。': 'The defense may examine {name}.', 崔佛: 'Trevor' });
    expect(translate('辯方可以詰問崔佛。')).toBe('The defense may examine Trevor.');
    expect(translate('辯方可以詰問路人。')).toBe('The defense may examine 路人.');
  });

  it('兩個變數緊貼的 key 不當樣板，不會把沒翻的句子切碎', () => {
    install({ '{verb}{name}': '{verb} {name}' });
    expect(translate('還沒翻的句子')).toBe('還沒翻的句子');
  });

  it('人名本身有「・」時，從最長的前段切，名字和職業都翻得到', () => {
    install({
      '{a}・{b}': '{a} · {b}',
      華特・班奈特: 'Walter Bennett',
      退休警察: 'Retired police officer',
    });
    expect(translate('華特・班奈特・退休警察')).toBe('Walter Bennett · Retired police officer');
    expect(translate('華特・班奈特')).toBe('Walter Bennett');
    expect(translate('路人・甲')).toBe('路人 · 甲');
  });

  it('金額：中文用萬，英文用 million', () => {
    expect(money(4900000, 'zh')).toBe('490 萬');
    expect(money(4900000, 'en')).toBe('$4.9 million');
    expect(money(4225000, 'zh')).toBe('422.5 萬');
    expect(money(4225000, 'en')).toBe('$4.225 million');
    expect(money(900000, 'en')).toBe('$900,000');
  });

  it('頓號清單每一項都查得到才翻', () => {
    install({ 邏輯: 'Logic', 情感: 'Emotion' });
    expect(translate('邏輯、情感')).toBe('Logic, Emotion');
    expect(translate('邏輯、別的')).toBe('邏輯、別的');
  });

  it('介面句子用變數代入，中英文都可以', () => {
    install({ '剩 {n} 工時': '{n} hours left' });
    expect(t('剩 {n} 工時', { n: 3 })).toBe('剩 3 工時');
    useLang.setState({ lang: 'en' });
    expect(t('剩 {n} 工時', { n: 3 })).toBe('3 hours left');
    expect(t('沒翻的 {n}', { n: 1 })).toBe('沒翻的 1');
  });

  it('中文模式原樣顯示；切到英文才載入英文檔', async () => {
    expect(t('誘導')).toBe('誘導');
    await setLang('en');
    expect(t('誘導')).toBe('Leading');
    expect(t('異議，傳聞。')).toBe('Objection, hearsay.');
    await setLang('zh');
    expect(t('誘導')).toBe('誘導');
  });
});
