import { relations, type Relation } from '../engine/constants';

/**
 * 這些選項問的是「這兩張卡之間的關係」，不是這條推理的結論。
 * 試玩回饋：只寫「支持／矛盾」會讓人以為是在問對疑問的立場，所以改成整句話。
 */
export const relationSentence = (r: Relation, a: string, b: string) => {
  const x = a || '第一張卡';
  const y = b || '第二張卡';
  switch (r) {
    case '支持':
      return `${x}和${y}講的是同一件事，互相印證`;
    case '縮小範圍':
      return `${x}留下一個範圍或缺口，${y}把它收窄或補上`;
    case '矛盾':
      return `${x}和${y}不可能同時成立`;
    case '說明動機':
      return `${x}說明了${y}背後的動機`;
    case '說明機會':
      return `${x}說明了${y}的人有機會做到`;
  }
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
  const [a, b] = cards;
  if (compact)
    return (
      <fieldset className="relations compact">
        <legend className="sr-only">這兩張卡之間是什麼關係？</legend>
        <div className="chips kinds">
          {relations.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={value === r}
              aria-label={`${r}：${relationSentence(r, a ?? '', b ?? '')}`}
              onClick={() => onPick(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="muted small">
          {value ? relationSentence(value, a ?? '', b ?? '') : '選一種關係，說明這兩張卡怎麼連。'}
        </p>
      </fieldset>
    );
  return (
    <fieldset className="relations">
      <legend>這兩張卡之間是什麼關係？</legend>
      {relations.map((r) => (
        <button
          key={r}
          role="radio"
          aria-checked={value === r}
          className={value === r ? 'relation on' : 'relation'}
          onClick={() => onPick(r)}
        >
          <strong>{r}</strong>
          <span className="muted small">{relationSentence(r, a ?? '', b ?? '')}</span>
        </button>
      ))}
    </fieldset>
  );
}
