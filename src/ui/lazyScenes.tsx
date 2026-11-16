import { type ComponentType, use } from 'react';

/**
 * 延遲載入的場景元件（Issue #388 P3）：證據板、法庭、結辯這些大場景不放進主程式，
 * 主程式小一點，手機第一次打開到標題畫面比較快。
 * 進遊戲之後瀏覽器一閒下來就把它們全部預載（preloadScenes），玩家走到那一場時通常早就載好了，不會看到空白。
 * 沒載好的話（直接讀檔進法庭），Suspense 先不畫，載好就出現；不用 React.lazy，因為它就算已經載好也會先停一拍。
 */
type Loader<P> = () => Promise<ComponentType<P>>;

const loaders: (() => Promise<unknown>)[] = [];

function scene<P extends object>(load: Loader<P>): ComponentType<P> {
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
  function Lazy(props: P) {
    const Comp = C ?? use(preload());
    return <Comp {...props} />;
  }
  return Lazy;
}

export const Desk = scene(() => import('./scenes').then((m) => m.Desk));
export const Courtroom = scene(() => import('./scenes').then((m) => m.Courtroom));
export const Closing = scene(() => import('./scenes').then((m) => m.Closing));
export const Deposition = scene(() => import('./scenes').then((m) => m.Deposition));
export const Negotiation = scene(() => import('./scenes').then((m) => m.Negotiation));
export const VoirDire = scene(() => import('./scenes').then((m) => m.VoirDire));
export const Defense = scene(() => import('./scenes').then((m) => m.Defense));
export const Theory = scene(() => import('./scenes').then((m) => m.Theory));
export const Opening = scene(() => import('./scenes').then((m) => m.Opening));
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
