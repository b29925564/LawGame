import type { CSSProperties } from 'react';
import { LUCAS, lucas, lucasFace } from './cast';
import { castLook } from './jury/cast';
import { svg, type JurorLook } from './jury/silhouette';

/**
 * 卷宗旁、名單上的人像卡，4:5、--radius，跟陪審席同一種卡（設定集第 7.6 章）。
 * - 陪審員候選人（look）：剪影、端坐、受光 60（遴選，設計師 10-09）。
 * - 其他配角：同一張說話者剪影，J1、受光 85，跟法庭的 CourtFace 一樣（設計師 #446，11-27：檔案照模板 B 退役）。
 * - 盧卡斯：AI 立繪，同一個 4:5 外框，沒有米色紙邊。
 * - 對不到外型的人：不畫（呼叫的人照沒有頭像排版）。
 * 剪影就是定稿，不加名字、不加標籤、不加虛線框（使用者 11-16）。
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
  const style = { '--w': `${size}px` } as CSSProperties;
  if (who === LUCAS && !look)
    return (
      <span
        className={`silcard face s${size} face-crop`}
        style={{ ...style, ...lucasFace('平') }}
        aria-hidden
      >
        <img
          src={lucas('平', 144)}
          srcSet={`${lucas('平', 144)} 144w, ${lucas('平', 512)} 512w`}
          sizes={`${size}px`}
          alt=""
          decoding="async"
        />
      </span>
    );
  const face = look ?? castLook(who);
  if (!face) return null;
  return (
    <span
      className={look ? `silcard s${size}` : `silcard face s${size}`}
      style={style}
      aria-hidden
      dangerouslySetInnerHTML={{
        __html: svg(
          face,
          look
            ? { v: 60, pose: 'J1', uid: `id-${face.id}-${size}` }
            : { v: 85, pose: 'J1', uid: `idf-${face.id}-${size}` },
        ),
      }}
    />
  );
}
