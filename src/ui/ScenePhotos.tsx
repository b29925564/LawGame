import { useState } from 'react';
import type { Scene } from '../engine/episode/schema';
import { useT } from '../i18n';
import { PhotoLog, ZoomDialog } from './Dossier';
import { useScope } from './lang';
import { hasPrint } from './prints';

type ScenePhoto = NonNullable<Extract<Scene, { type: 'card' }>['photos']>[number];

/**
 * 片頭之後第一個畫面：週六凌晨，同一個房間的警方閃光照片（設定集第 5 章 0505、第 9 章 :66）。
 * 不放在冷開場：11.5 規定冷開場三格沒有血、沒有黃。閃燈直打、背景掉黑，只拍物件和證物牌；
 * 遺體只以「照片已遮蔽」黑條出現。照片紀錄表照順序排，時間是第一張的拍攝時間。
 * 一格一黃：獎盃那張照片裡的證物牌（--photo-yellow）就是這一頁的黃，所以「繼續」不用黃。
 * 只放有實物照片的（場景光影還在算的那張先不放，交圖後同檔名覆蓋就出現）。
 */
export function ScenePhotos({ photos, onNext }: { photos: ScenePhoto[]; onNext: () => void }) {
  const t = useT();
  const scope = useScope();
  const [zoom, setZoom] = useState<string | null>(null);
  const shots = photos.filter((p) => hasPrint(p.id));
  const open = shots.find((p) => p.id === zoom);
  return (
    <main className="cine cine-photos">
      {shots[0] && <p className="cine-time">{shots[0].photo.at}</p>}
      <ul className="scene-photos" aria-label={t('現場照片')}>
        {shots.map((p) => (
          <li key={p.id} className="scene-photo">
            <PhotoLog
              photo={p.photo}
              id={p.id}
              use="scene"
              redacted={p.redacted}
              alt={t(p.subject, scope)}
            />
            <button
              className="cork-zoom"
              aria-label={t('放大檢視 {name}', { name: t(p.subject, scope) })}
              onClick={() => setZoom(p.id)}
            >
              {t('放大')}
            </button>
          </li>
        ))}
      </ul>
      <button className="cine-next" onClick={onNext}>
        {t('繼續')}
      </button>
      {open && (
        <ZoomDialog title={t(open.subject, scope)} onClose={() => setZoom(null)}>
          <PhotoLog
            photo={open.photo}
            id={open.id}
            use="zoom"
            redacted={open.redacted}
            alt={t(open.subject, scope)}
          />
        </ZoomDialog>
      )}
    </main>
  );
}
