import { episode, useGame } from '../engine/store';

/** 證據板：列出已蒐集的證據。onPick 有給時每張卡變成可點選（法庭上出示用）。 */
export function EvidenceList({ onPick }: { onPick?: (id: string) => void }) {
  const collected = useGame((s) => s.collected);
  const items = episode.evidence.filter((e) => collected.includes(e.id));
  if (items.length === 0)
    return <p className="empty">還沒有證據。打開文件，把有用的內容列為證據。</p>;
  return (
    <ul className="evidence">
      {items.map((e) => (
        <li key={e.id}>
          <strong>{e.name}</strong>
          <span>{e.description}</span>
          {onPick && (
            <button className="primary" onClick={() => onPick(e.id)}>
              出示
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
