/**
 * 標題畫完、瀏覽器閒下來以後，先把冷開場之後第一場（firm-morning）要用的中文主檔載好（設計師 #462 複審）。
 * 首屏檔只有標題、片頭、冷開場的字；主檔要等畫面出現別的字才會下載，Slow 4G 上 firm-morning 的字會先用後備字型再換字。
 * 玩家看片頭、冷開場的時間夠把主檔載完。
 * 順序照 firm-morning 用到的先後：第一句是旁白（Noto Serif TC 400），先載它；接著是對白（Noto Sans TC 500、400）與名字（700）。
 * 不用 <link rel="preload">：preload 在 HTML 一解析就開始下載，會跟標題畫面要的主程式與首屏字搶頻寬。
 *
 * 主檔是同字族裡沒有 unicode-range 的那一份（首屏與補充檔都有範圍，fonts.css 由 scripts/fonts.py 產生）。
 */
const GROUPS: [family: string, weight: string][][] = [
  [['Noto Serif TC', '400']],
  [
    ['Noto Sans TC', '500'],
    ['Noto Sans TC', '400'],
    ['Noto Sans TC', '700'],
  ],
];
const ALL = 'U+0-10FFFF';

let started = false;

/** 一組主檔：同時載；載不到就等畫面真的用到時再試，跟沒預載一樣。 */
const loadGroup = (group: [string, string][]) =>
  Promise.all(
    [...document.fonts]
      .filter(
        (face) =>
          group.some(([f, w]) => face.family.replace(/["']/g, '') === f && face.weight === w) &&
          face.unicodeRange.toUpperCase() === ALL &&
          face.status === 'unloaded',
      )
      .map((face) => face.load().catch(() => undefined)),
  );

export function warmMainFonts() {
  if (started || typeof document === 'undefined' || !('fonts' in document)) return;
  started = true;
  const go = () =>
    void GROUPS.reduce<Promise<unknown>>((p, g) => p.then(() => loadGroup(g)), Promise.resolve());
  const idle = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 1000);
  };
  // 標題畫完：兩格之後版面已經排過、首屏字開始載；等它們都到了（fonts.ready）再排進閒置時間。
  requestAnimationFrame(() =>
    requestAnimationFrame(() => void document.fonts.ready.then(idle, idle)),
  );
}
