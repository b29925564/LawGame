import { type ComponentType, Suspense, use, useEffect, useState } from 'react';
import { useT } from '../i18n';

/**
 * 延遲載入的場景元件（Issue #388 P3）：證據板、法庭、結辯這些大場景不放進主程式，
 * 主程式小一點，手機第一次打開到標題畫面比較快。
 * 進遊戲之後瀏覽器一閒下來就把它們全部預載（preloadScenes），玩家走到那一場時通常早就載好了，不會看到空白。
 * 沒載好的話（直接讀檔進法庭）先放一塊空白（SceneWait），載好就換上；不用 React.lazy，因為它就算已經載好也會先停一拍。
 */
type Loader<P> = () => Promise<ComponentType<P>>;

const loaders: (() => Promise<unknown>)[] = [];

/** 等超過這麼久才出「載入中」：和片頭同一條規則（TitleIntro.tsx LOADING_AFTER，設計師 v95）。 */
const LOADING_AFTER = 1500;

/**
 * 場景還沒載好時佔滿場景區的空白（設計師 #404 審查）：不轉圈、不動。
 * 法庭系的場景用底圖解碼前的純黑，其他場景用頁面底色，所以不會先閃一下淺灰再切到深色法庭。
 * 等超過 1.5 秒右下角出「載入中」，位置、字和片頭的一樣；場景出來就跟著拿掉。
 */
function SceneWait({ dark }: { dark: boolean }) {
  const t = useT();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), LOADING_AFTER);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className={dark ? 'scene-wait dark' : 'scene-wait'} aria-busy="true">
      {slow && (
        <div className="ti-corner">
          <p className="ti-loading" role="status">
            {t('載入中')}
          </p>
        </div>
      )}
    </div>
  );
}

function scene<P extends object>(load: Loader<P>, dark = false): ComponentType<P> {
  let C: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const preload = () =>
    (pending ??= load().then(
      (c) => (C = c),
      (e) => {
        // 網路斷了：下次再試，不把失敗的 promise 留著。
        pending = undefined;
        throw e;
      },
    ));
  loaders.push(preload);
  function Loaded(props: P) {
    const Comp = C ?? use(preload());
    // Comp 是載入後快取在模組層的同一個元件，不是每次 render 新建的。
    // eslint-disable-next-line react-hooks/static-components
    return <Comp {...props} />;
  }
  // 一律包在同一個 Suspense 裡：載好以後也不換掉這層，場景才不會因為樹的形狀變了被重新掛載、狀態歸零。
  function Lazy(props: P) {
    return (
      <Suspense fallback={<SceneWait dark={dark} />}>
        <Loaded {...props} />
      </Suspense>
    );
  }
  return Lazy;
}

export const Desk = scene(() => import('./scenes').then((m) => m.Desk));
export const Courtroom = scene(() => import('./scenes').then((m) => m.Courtroom), true);
export const Closing = scene(() => import('./scenes').then((m) => m.Closing), true);
export const Deposition = scene(() => import('./scenes').then((m) => m.Deposition));
export const Negotiation = scene(() => import('./scenes').then((m) => m.Negotiation));
export const VoirDire = scene(() => import('./scenes').then((m) => m.VoirDire), true);
export const Defense = scene(() => import('./scenes').then((m) => m.Defense), true);
export const Theory = scene(() => import('./scenes').then((m) => m.Theory));
export const Opening = scene(() => import('./scenes').then((m) => m.Opening), true);
export const Interview = scene(() => import('./scenes').then((m) => m.Interview));
export const Prototype = scene(() => import('./Prototype').then((m) => m.Prototype));

/** 進遊戲後、瀏覽器閒下來時把場景全部載好（原型模式除外，它只從標題進）。 */
export function preloadScenes() {
  const run = () => {
    for (const load of loaders.slice(0, -1)) void load().catch(() => {});
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 500);
}
