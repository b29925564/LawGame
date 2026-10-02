import { createContext, useContext, useEffect } from 'react';
import { setLang, useLang, useT } from '../i18n';

/** 目前場景的 id：劇本句子查英文時當 scope（同一句中文在不同場景可以有不同譯法）。 */
export const SceneScope = createContext<string | undefined>(undefined);
export const useScope = () => useContext(SceneScope);

const FONTS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;700&family=Source+Serif+4:ital,wght@0,400;0,700;0,900;1,400&display=swap';

/**
 * 跟著語言換 <html lang>，英文模式才下載 Plex Sans 與 Source Serif 4
 * （視覺設計師定案，字體變數在 styles.css 的 :root:lang(en)）。
 */
export function useDocumentLang() {
  const lang = useLang((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
    if (lang !== 'en' || document.getElementById('font-en')) return;
    const link = document.createElement('link');
    link.id = 'font-en';
    link.rel = 'stylesheet';
    link.href = FONTS;
    document.head.appendChild(link);
  }, [lang]);
}

/** 語言切換：標題畫面與選項共用。按鈕上的字永遠用該語言自己的寫法。 */
export function LangSwitch() {
  const lang = useLang((s) => s.lang);
  const t = useT();
  return (
    <div className="lang-switch" role="group" aria-label={t('語言')}>
      <button aria-pressed={lang === 'zh'} lang="zh-Hant" onClick={() => void setLang('zh')}>
        中文
      </button>
      <button aria-pressed={lang === 'en'} lang="en" onClick={() => void setLang('en')}>
        English
      </button>
    </div>
  );
}
