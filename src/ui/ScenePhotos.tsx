import { useState } from 'react';
import type { Episode, Scene } from '../engine/episode/schema';
import { useT } from '../i18n';
import { PhotoLog, ZoomDialog } from './Dossier';
import { useScope } from './lang';
import { hasPrint, type PrintUse } from './prints';
import { prose } from './prose';

type PhotoPage = NonNullable<Extract<Scene, { type: 'dialogue' }>['photos']>;
type Shot = PhotoPage['shots'][number];

/** 卷宗文件附的照片（docs[].photos）指向哪一張：同一集某一場照片頁裡的那一份。 */
export function shotsById(ep: Episode, ids: readonly string[]): Shot[] {
  const all = ep.scenes.flatMap((s) => (s.type === 'dialogue' && s.photos?.shots) || []);
  return ids.flatMap((id) => all.filter((p) => p.id === id));
}

/**
 * 照片紀錄表（第 9 章 PhotoLog）照順序排，每張右上角一顆「放大」。照片頁和卷宗的附件共用。
 * 只放有實物照片的（場景光影還在算的那張先不放，交圖後同檔名覆蓋就出現）。
 */
export function ShotList({ shots, use }: { shots: readonly Shot[]; use: PrintUse }) {
  const t = useT();
  const scope = useScope();
  const [zoom, setZoom] = useState<string | null>(null);
  const shown = shots.filter((p) => hasPrint(p.id));
  const open = shown.find((p) => p.id === zoom);
  return (
    <>
      <ul className="scene-photos" aria-label={t('現場照片')}>
        {shown.map((p) => (
          <li key={p.id} className="scene-photo">
            <PhotoLog
              photo={p.photo}
              id={p.id}
              use={use}
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
    </>
  );
}

/**
 * 對話演完之後的文件照片頁：第 1 集週一 16:05 開示送到，警方報告附件二的現場照片（設定集第 5 章 0505、第 9 章 PhotoLog）。
 * 這是辯方收到的影本（有 Bates），不是一場戲，所以不放場記：頂上一行印在附件封面上的字（法院紙面字族），
 * 每張照片紀錄表的時間自己說「週六凌晨拍」（content/slates/2026-10-10-police-photos-timing.md）。
 * 閃燈直打、背景掉黑，只拍物件和證物牌；遺體只以「照片已遮蔽」黑條出現。
 * 一格一黃：獎盃那張照片裡的證物牌（--photo-yellow）就是這一頁的黃，所以「繼續」不用黃。
 */
export function ScenePhotos({ photos, onNext }: { photos: PhotoPage; onNext: () => void }) {
  const t = useT();
  const scope = useScope();
  return (
    <main className="cine cine-photos">
      <h2 className="photos-label" aria-label={t(photos.title, scope)}>
        {/* 封面上用全形空格隔開的幾段各自成組；英文的「Attachment 2」「batch 1」名詞和編號不拆開。 */}
        {t(photos.title, scope)
          .split('\u3000')
          .map((part) => (
            <span key={part}>{prose(part.replace(/([A-Za-z]) (\d)/g, '$1\u00a0$2'))}</span>
          ))}
      </h2>
      <ShotList shots={photos.shots} use="scene" />
      <button className="cine-next" onClick={onNext}>
        {t('繼續')}
      </button>
    </main>
  );
}
