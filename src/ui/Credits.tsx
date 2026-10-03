import { useT } from '../i18n';

/** CC BY 4.0 要求的署名（src/audio/LICENSES.md「署名文字」）；其餘音檔是 CC0 或自製，不必署名。 */
const ATTRIBUTIONS = [
  {
    use: '法庭緊張配樂',
    title: 'Suspension: Mellow Electro-Ambient Soundscape',
    author: 'kjartan_abel',
    url: 'https://freesound.org/people/kjartan_abel/sounds/531854/',
  },
  {
    use: '結辯配樂',
    title: 'Ambient Documentary Build Up #02',
    author: 'tyops',
    url: 'https://freesound.org/people/tyops/sounds/437317/',
  },
  {
    use: '圖釘音效',
    title: 'Tacking paper to a cork board',
    author: 'pfranzen',
    url: 'https://freesound.org/people/pfranzen/sounds/266894/',
  },
] as const;

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';

const FONTS =
  'Noto Sans TC, Noto Serif TC, LXGW WenKai TC, Courier Prime, JetBrains Mono, IBM Plex Sans, Source Serif 4';

/** 製作群：標題畫面打開。作品名照原文，不翻譯。 */
export function Credits() {
  const t = useT();
  return (
    <section className="stack credits" aria-label={t('製作群')}>
      <h2>{t('音樂與音效')}</h2>
      <ul className="stack">
        {ATTRIBUTIONS.map((a) => (
          <li key={a.url}>
            <span className="muted">{t(a.use)}</span>
            <span>
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.title}
              </a>{' '}
              {t('作者')} {a.author}・
              <a href={CC_BY} target="_blank" rel="noreferrer">
                CC BY 4.0
              </a>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">{t('其餘音效與環境音為 CC0 公眾領域素材或本作自製。')}</p>
      <h2>{t('字型')}</h2>
      <p className="small">
        {FONTS}
        {t('，皆以 SIL Open Font License 1.1 授權。')}
      </p>
    </section>
  );
}
