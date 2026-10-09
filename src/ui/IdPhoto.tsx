import type { CSSProperties } from 'react';
import { useT } from '../i18n';
import { LUCAS, lucas } from './cast';
import { svg, type JurorLook } from './jury/silhouette';
import { useScope } from './lang';

/**
 * 檔案照（視覺規格 §16，模板 B）：真立繪到位之前，配角都用這張。
 * 3:4 紙色相片區，中央是姓的第一個字（英文介面是姓的首字母）；96 寬才在下面印名字。
 * 盧卡斯一律放照片，同一個外框。
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
  // 「茱蒂絲・柯恩」取「柯」；「Judith Cohen」取「C」。
  const last =
    name
      .split(/[・·\s]+/)
      .filter(Boolean)
      .pop() ?? name;
  const cls =
    (size === 40 ? 'idphoto s40' : size === 28 ? 'idphoto s28' : 'idphoto') + (look ? ' sil' : '');
  const label = t('待放 AI 立繪　{name}', { name });
  return (
    <span className={cls} style={{ '--w': `${size}px` } as CSSProperties} aria-hidden>
      {look ? (
        <span
          className="ph"
          dangerouslySetInnerHTML={{
            __html: svg(look, { v: 60, pose: 'J1', label, uid: `id-${look.id}-${size}` }),
          }}
        />
      ) : (
        <span className="ph">
          {who === LUCAS ? (
            <img src={lucas('平', 144)} alt="" decoding="async" />
          ) : (
            <b>{last[0]}</b>
          )}
        </span>
      )}
      {size === 96 && (
        <span className="nm">{/^[A-Za-z]/.test(name) ? name.toUpperCase() : name}</span>
      )}
    </span>
  );
}
