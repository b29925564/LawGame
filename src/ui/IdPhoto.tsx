import type { CSSProperties } from 'react';
import { useT } from '../i18n';
import { LUCAS, lucas } from './cast';
import { svg, type JurorLook } from './jury/silhouette';
import { Tbd } from './jury/Tbd';
import { useScope } from './lang';

/**
 * 檔案照（視覺規格 §16，模板 B）：真立繪到位之前，配角都用這張。
 * 3:4 紙色相片區，中央是姓的第一個字（英文介面是姓的首字母）；96 寬才在下面印名字。
 * 盧卡斯一律放照片，同一個外框。
 *
 * look（陪審員候選人）：遴選在法庭裡，法庭裡的人一律是剪影卡（使用者 10-09）。不套模板 B 的外框、不重複印名字，
 * 跟陪審席同一種卡：--radius、只有一圈虛線（設計師第二輪）。96 寬的人物卡是單一人物，框外上方寫
 * 「待放 AI 立繪\u3000{全名}」；名單與陪審席的小卡成排，標籤由整排一個（Tbd row）。
 */
export function IdPhoto({
  who,
  size = 96,
  look,
}: {
  who: string;
  size?: 96 | 72 | 40 | 28;
  /** 陪審員候選人：AI 立繪到位前用剪影替身（設定集第 7.6 章；設計師 10-09），端坐、不帶影子。 */
  look?: JurorLook;
}) {
  const t = useT();
  const scope = useScope();
  const name = t(who, scope);
  if (look) {
    const card = (
      <span
        className={`silcard s${size}`}
        style={{ '--w': `${size}px` } as CSSProperties}
        aria-hidden
        dangerouslySetInnerHTML={{
          __html: svg(look, { v: 60, pose: 'J1', frame: true, uid: `id-${look.id}-${size}` }),
        }}
      />
    );
    return size === 96 ? <Tbd name={name}>{card}</Tbd> : card;
  }
  // 「茱蒂絲・柯恩」取「柯」；「Judith Cohen」取「C」。
  const last =
    name
      .split(/[・·\s]+/)
      .filter(Boolean)
      .pop() ?? name;
  const cls = size === 40 ? 'idphoto s40' : size === 28 ? 'idphoto s28' : 'idphoto';
  return (
    <span className={cls} style={{ '--w': `${size}px` } as CSSProperties} aria-hidden>
      <span className="ph">
        {who === LUCAS ? <img src={lucas('平', 144)} alt="" decoding="async" /> : <b>{last[0]}</b>}
      </span>
      {size === 96 && (
        <span className="nm">{/^[A-Za-z]/.test(name) ? name.toUpperCase() : name}</span>
      )}
    </span>
  );
}
