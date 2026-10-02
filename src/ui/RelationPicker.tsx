import { relations, type Relation } from '../engine/constants';
import { t, useT } from '../i18n';
import { useScope } from './lang';

/**
 * 這些選項問的是「這兩張卡之間的關係」，不是這條推理的結論。
 * 試玩回饋：只寫「支持／矛盾」會讓人以為是在問對疑問的立場，所以改成整句話。
 */
export const relationSentence = (r: Relation, a: string, b: string) => {
  // a、b 是已經照目前語言翻好的卡名；這裡不是元件，用非響應式的 t，呼叫它的元件已訂閱語言。
  const vars = { x: a || t('第一張卡'), y: b || t('第二張卡') };
  switch (r) {
    case '支持':
      return t('{x}和{y}講的是同一件事，互相印證', vars);
    case '縮小範圍':
      return t('{x}留下一個範圍或缺口，{y}把它收窄或補上', vars);
    case '矛盾':
      return t('{x}和{y}不可能同時成立', vars);
    case '說明動機':
      return t('{x}說明了{y}背後的動機', vars);
    case '說明機會':
      return t('{x}說明了{y}的人有機會做到', vars);
  }
};

/** 連線台上兩卡之間畫的符號（設計稿 board-redesign 修訂）。 */
export const relationMark: Record<Relation, string> = {
  支持: '＝',
  矛盾: '⟂',
  縮小範圍: '⊃',
  說明動機: '⇒',
  說明機會: '⇢',
};

export function RelationPicker({
  cards,
  value,
  onPick,
  compact,
}: {
  cards: (string | undefined)[];
  value: Relation | null;
  onPick: (r: Relation) => void;
  /** 精簡版：一排關係名稱，只把選中的那句話寫出來，放得進連線台。 */
  compact?: boolean;
}) {
  const tr = useT();
  const scope = useScope();
  const [a, b] = cards.map((c) => (c ? tr(c, scope) : ''));
  if (compact)
    return (
      <fieldset className="relations compact">
        <legend className="sr-only">{tr('這兩張卡之間是什麼關係？')}</legend>
        <div className="chips kinds">
          {relations.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={value === r}
              aria-label={tr('{r}：{s}', { r: tr(r), s: relationSentence(r, a, b) })}
              title={relationSentence(r, a, b)}
              onClick={() => onPick(r)}
            >
              {tr(r)}
            </button>
          ))}
        </div>
      </fieldset>
    );
  return (
    <fieldset className="relations">
      <legend>{tr('這兩張卡之間是什麼關係？')}</legend>
      {relations.map((r) => (
        <button
          key={r}
          role="radio"
          aria-checked={value === r}
          className={value === r ? 'relation on' : 'relation'}
          onClick={() => onPick(r)}
        >
          <strong>{tr(r)}</strong>
          <span className="muted small">{relationSentence(r, a, b)}</span>
        </button>
      ))}
    </fieldset>
  );
}
