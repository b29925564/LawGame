# 上線前程式碼與安全審查：《合理懷疑》

- 審查版本：`main` @ `8d80aea`（2026-10-04）
- 範圍：安全、正確性、效能。不涉及劇情、對白、數值平衡、畫面設計；本報告只記錄問題，不改任何程式。
- 嚴重度定義：
  - **高**：上線後多數玩家會碰到，或會造成安全事故。
  - **中**：特定操作下會卡關、進度遺失、算錯，或明顯拖慢。
  - **低**：邊界情況、強化建議。

## 結論

- **沒有高嚴重度問題。** 安全面沒有可被外部利用的漏洞：
  - 全站沒有 `dangerouslySetInnerHTML`、`innerHTML` 或 `eval`。
  - `npm audit` 是 0。
  - 218 個 commit 的完整歷史裡沒有任何金鑰或憑證。
- 上線前最該處理的是：
  - 存檔的韌性：損壞或舊版存檔讀進來會白畫面，而且沒有 Error Boundary。
  - 進度遺失：只在換場時自動存檔。
  - 幾個讓分數或規則算錯的引擎問題。
- 因為沒有「高」的安全問題，**依指示沒有另開修正 PR**。

### 前五名

| #   | 嚴重度 | 問題                                                                     | 位置                                                   |
| --- | ------ | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| 1   | 中     | 損壞、竄改或欄位不符的存檔讀取後整個畫面變白，而且沒有 Error Boundary    | `src/engine/save.ts:84-96`、`src/main.tsx:9-13`        |
| 2   | 中     | 自動存檔只在換場時寫入；回標題、關分頁都不存，一整場的進度會遺失         | `src/engine/game.ts:634-650`、`src/engine/game.ts:755` |
| 3   | 中     | 遴選和開示的法官耐心懲罰每個開庭日都扣一次，畫面上卻寫「只扣開庭第一天」 | `src/engine/game.ts:354`                               |
| 4   | 中     | 工時用完時，還沒回應的證據開示請求直接略過，所有代價都不用付             | `src/engine/episode/desk.ts:466-468`                   |
| 5   | 中     | 讀取同一場景的存檔時，畫面狀態不會重置，可以跳過訪談的必問題             | `src/ui/App.tsx:52-63`                                 |

---

## 一、安全

### S1【中】存檔讀取只檢查兩個欄位，損壞或竄改的存檔會讓遊戲白畫面

- **位置**
  - `src/engine/save.ts:84-96`（`migrate`）
  - `src/engine/game.ts:714-719`（`load` 直接採用）
  - `src/main.tsx:9-13`（沒有 Error Boundary）
- **原因**
  - `migrate` 只確認 `progress.episode` 是字串、`progress.scene` 是數字。`cards`、`choices`、`flags`、`scenes` 以及各場景的狀態物件都沒有驗證，就直接放進 store。
  - 我用 Playwright 對建置後的頁面植入各種壞存檔，以下 5 種在中、英文模式下都會在按「繼續」後整頁變白：
    - `cards: null` → `n is not iterable`
    - `choices: null` → `Cannot convert undefined or null to object`
    - 桌面場景狀態是字串 → `reading 'includes'`
    - 談判場景狀態是 `{}` → `reading 'length'`
    - 庭審場景狀態缺欄位 → `reading 'length'`
  - 重新整理後會回到標題，所以不會整個遊戲打不開。但那個存檔永遠讀不了，自動存檔則要等新遊戲換場才會被覆蓋。
  - JSON 截斷（寫到一半）的情況已經由 `readSave` 的 try/catch 擋下，結果正常。
  - 歸為「中」而不是「高」：要改 localStorage 得先有同源的寫入能力（玩家自己動手、同源的其他頁面，或已經存在的 XSS）。不過任何一次存檔結構變更若忘了加版本號，也會走到同一條路徑（見 C7）。
- **建議修法**
  - 在 `migrate` 最後用 zod 驗證 `Progress`：
    - `cards`、`flags`、`ethics` 是 `string[]`
    - `choices` 是 `Record<string, number>`
    - `scenes` 是 `Record<string, unknown>`
    - `scene`、`step` 是非負整數
    - `episode` 必須在 `episodes` 裡
  - 驗證失敗就回傳 `null`，讀檔清單顯示「存檔損毀」。
  - 在 `<App/>` 外包一層 Error Boundary，出錯時提供「讀取自動存檔／回標題」，不要讓 React 卸掉整棵樹。
  - zod 目前只在建置時使用；要在瀏覽器端用，可以只對存檔寫一個小型手寫檢查，避免把 zod 打包進來。

### S2【低】沒有 Content-Security-Policy

- **位置**：`index.html:1-19`。repo 裡也沒有任何部署設定。
- **原因**：目前沒有 XSS 注入點，但沒有 CSP 就少了一層防線，往後若有人引入 `innerHTML` 或第三方腳本，不會被攔下。
- **建議修法**：在部署端的 header 或 `index.html` 的 `<meta http-equiv>` 加上
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self'`
  然後跑一次 e2e 確認沒有被擋。

### S3【低】Google Fonts 從第三方載入（隱私與可用性）

- **位置**
  - `index.html:7-12`
  - `src/ui/lang.tsx:8-9`、`src/ui/lang.tsx:20-24`
- **原因**
  - 每位玩家的 IP 都會送到 Google。歐盟有判例認定這需要同意，例如德國慕尼黑地方法院 2022 年的判決。
  - 這支樣式表會擋住頁面渲染，Google 被封鎖的地區只能看備用字型。
  - Google Fonts 的 CSS 是動態產生的，加不了 SRI。
- **建議修法**：改成自行託管字型（例如 `@fontsource/*` 或預先做子集），和遊戲同源提供，也就不需要 S2 裡的外部來源。

### S4【低】CI workflow 沒有限制權限，actions 只鎖版本標籤

- **位置**：`.github/workflows/ci.yml:1-38`
- **原因**
  - 沒有宣告 `permissions:`，`GITHUB_TOKEN` 會套用儲存庫的預設權限。
  - `actions/checkout@v4` 與 `actions/setup-node@v4` 鎖的是可以移動的標籤。
- **建議修法**
  - 在最上層加 `permissions: { contents: read }`。
  - 把 action 鎖到 commit SHA，並用 Dependabot 更新。

### S5【低】玩家設定從 localStorage 讀出來沒有驗證

- **位置**
  - `src/engine/settings.ts:28-45`（`persist` 沒有 `migrate` 或 `merge`）
  - `src/engine/store.ts:48-97`（原型模式的 `persist`，第 95 行的 `migrate` 只處理版本，不驗證內容）
- **原因**：`textScale`、`objectionSeconds`、音量等數值被改成極端值或錯的型別時會原樣套用。例如 `textScale` 寫入 `--text-scale` 後版面會壞；原型模式的狀態被改成不合結構則會崩潰。
- **建議修法**：在 `persist` 加 `merge`，把每個數值夾到 UI 允許的範圍，型別不對就用預設值。

### S6【低】託管在共用網域時，存檔會被同源頁面讀寫

- **位置**：`src/engine/save.ts:98`（`lawgame-ep-*`）、`src/i18n/index.ts:17`
- **原因**：localStorage 以「來源」區隔。如果部署在像 `<user>.github.io/<repo>` 這種多專案共用的網域，同網域的其他頁面都能讀寫存檔，連帶觸發 S1。
- **建議修法**：部署在獨立的（子）網域；S1 的驗證也能把影響降到「存檔被判為損毀」。

### S7【資訊】卡片的 `image` 欄位沒有限制格式

- **位置**：`src/engine/episode/schema.ts:198`、`src/ui/Evidence.tsx:262`
- **原因**：`image: z.string()` 可以填任意 URL，包括外部網址。目前劇本沒有用到這個欄位，`<img src>` 也不會執行 `javascript:`，所以沒有實際風險。
- **建議修法**：限制成相對路徑或打包的資源，例如 `z.string().regex(/^[\w/.-]+\.(webp|avif|png)$/)`。

### 已檢查、沒有問題的項目

- **XSS**
  - 全專案沒有 `dangerouslySetInnerHTML`、`innerHTML`、`insertAdjacentHTML`、`eval`、`new Function`。
  - 劇本與英文對照表都是 `t()` 回傳的純字串，交給 React 時會跳脫。
  - `i18n/index.ts` 的樣板只做字串代換；從對照表鍵編出正規表示式之前，會先跳脫特殊字元（`:35`）。
- **劇本載入**：YAML 在建置時由 `vite.config.ts:11-27` 解析並用 zod 驗證，瀏覽器端不解析 YAML。
- **外部連結**：`src/ui/Credits.tsx:41,46` 有 `rel="noreferrer"`，等同 noopener。
- **音效**：`src/engine/sound.ts:133` 只 `fetch` 打包進來的同源檔案。
- **依賴漏洞**：`npm audit`（含 dev）和 `npm audit --omit=dev` 都是 0 個漏洞；`package-lock.json` 裡所有套件都從 `registry.npmjs.org` 取得。
- **金鑰與憑證**：
  - 用常見格式掃過全部 218 個 commit 的 diff，沒有命中：AWS、GitHub、OpenAI、Slack、Google API、Hugging Face、npm token、私鑰。
  - 歷史裡從來沒有出現過 `.env`、`.pem`、`.npmrc` 等檔案。
- **`pipeline/publish/` 打包流程**：這個目錄目前不存在，歷史裡也從來沒有出現過，所以**無法審查**。repo 裡唯一的自動化是 `.github/workflows/ci.yml`，它只建置和測試，不發布。如果發布流程放在別的 repo 或機器上，需要另外提供才能審。
- **建置標記**：標題畫面顯示 commit 短碼（`vite.config.ts:30-39`），不算敏感資訊。

---

## 二、正確性

### C1【中】自動存檔只在換場時寫入，回標題、關分頁都會遺失這一場的進度

- **位置**
  - `src/engine/game.ts:634-650`（只有 `nextScene` 會呼叫 `writeSave('auto')`）
  - `src/engine/game.ts:755`（`toTitle` 不存檔）
  - `src/ui/GameMenu.tsx:64`（回標題沒有確認）
  - `src/ui/Title.tsx:95`（「繼續」讀的是 `auto`）
- **原因**
  - 桌面調查、庭審這類場景可能玩很久。
  - 從選單回標題再按「繼續」，會回到這一場開頭（已用單元測試重現：標記過的事實全部消失）。
  - 關掉分頁或手機瀏覽器被系統回收，也會這樣。
  - 剛開新遊戲、還沒換場時，標題的「繼續」讀到的是上一輪的自動存檔。
- **建議修法**
  - `toTitle` 先寫 `auto`。
  - 監聽 `pagehide` 和 `visibilitychange`（變成 hidden 時）寫一次 `auto`。
  - 可以考慮在每個場景動作後做節流存檔，例如每 5 秒最多一次。

### C2【中】遴選和開示的法官耐心懲罰每個開庭日都扣一次

- **位置**
  - `src/engine/game.ts:354`（`patience: Math.max(1, s.patience - st.wrong - cost)`）
  - `src/engine/episode/trial.ts:139`（每一場庭審都從 `courtScene` 的耐心重新開始）
  - 畫面說明在 `src/ui/VoirDire.tsx:99`
- **原因**
  - `courtScene` 對每一個 `trial` 場景都會扣掉遴選時「沒有根據的聲請」次數和開示代價。
  - 第 1 集有三個開庭日（kowalski、sophie、rachel）。遴選錯 2 次時，三天都從 5 點變成 3 點，總共少了 6 點；遴選頁寫的卻是「開庭第一天的法官耐心會少 2 點」。
  - 不管設計原意是哪一個，規則和說明現在對不起來。
- **建議修法**
  - 如果原意是「只扣第一天」：只在 `previousJury(p, s)` 是 `undefined` 時扣。
  - 如果原意是「每天都扣」：改說明文字。
  - 屬於規則的定義，請企劃確認。
- **處理狀態：未修，需要設計判斷。**
  - 兩種修法會往相反方向改變第 1 集的難度：只扣第一天，後兩天耐心多回來；每天都扣，則要改說明文字。前者是數值平衡，後者是對白與介面字串，而英文字串在 `src/content/en/`，都在這次「不動」的範圍內。
  - 請企劃先決定原意，再開 PR。

### C3【中】工時歸零時，沒回應的證據開示請求直接略過

- **位置**
  - `src/engine/episode/desk.ts:466-468`（`done = wrapped || hours <= 0`）
  - `src/engine/episode/desk.ts:471-473`（`canWrap` 要求 `allAnswered`）
  - `src/ui/Desk.tsx:138-146`（`finished` 之後只剩「開庭」）
- **原因**
  - 主動收工必須先回應完所有開示請求；工時用完卻可以直接離開。
  - 結果是沒回應的請求不會留下 `discovery:*` 旗標、法官耐心代價、陪審團效果，也不會觸發懲罰性賠償的條件。
  - 第 2 集用單元測試重現：把工時花到 0 時，`unanswered 4`，`allFlags = []`，`punitiveBonus = null`。
  - 也就是說，故意耗光工時比交出或隱匿文件都划算；玩家也可能不小心碰到。
- **建議修法**
  - 工時歸零時，對每一筆沒回應的請求套用預設結果（例如視為被裁定照交 `compelled`）。
  - 或者在全部回應完之前，開示 App 一直保持可用。
- **處理狀態：未修，需要設計判斷。**
  - 沒回應的請求該算成哪一種結果（照交、被裁定照交、還是視為隱匿），會直接決定法官耐心、陪審團效果和懲罰性賠償，屬於數值平衡與劇情分支。
  - 「開示 App 一直可用」則要改工時用完後的流程與畫面（`src/ui/Desk.tsx` 的 `finished` 狀態），屬於設計。
  - 兩者都需要企劃決定，這次不改。

### C4【中】被拒絕的連線可以重複送出，每次都扣 1 工時

- **位置**：`src/engine/episode/desk.ts:216-223`、`src/ui/Desk.tsx:662`
- **原因**
  - 連線失敗後，選好的卡片和關係不會清掉，`canConnect` 仍然成立，按鈕也還能按。
  - 推理鏈的提交有 `triedBefore` 防止重複（`desk.ts:281`、`desk.ts:288`），連線沒有。
  - 連點同一組錯誤連線，工時從 24 → 23 → 22（單元測試重現）。這也會更快把玩家推到 C3。
- **建議修法**：失敗後清空 `link`；或記下已經失敗過的（卡片排序後＋關係）組合，再次送出時不扣工時，直接提示「這條試過了」。

### C5【中】讀取同一場景的存檔時，畫面狀態沒有重置

- **位置**
  - `src/ui/App.tsx:52-63`（場景元件的 `key` 只用 `scene.id`）
  - `src/ui/Interview.tsx:19-20`、`src/ui/Interview.tsx:120`
  - `src/engine/game.ts:721-734`（`advance` 只對 phone 和 dialogue 檢查完成條件）
- **原因**
  - `load()` 只換掉 `progress`。讀進來的存檔如果和目前在同一個場景，元件不會重新掛載，裡面的 `useState` 都留著。
  - 訪談按過「結束會見」後再讀同一場較早的存檔，`leaving` 仍然是 true，畫面只剩「繼續」。按下去會呼叫 `advance()`，而它不檢查 `canFinish`，所以必問題沒問完也能離開。
  - 談判的 `intro`、`choice`、`last`，以及庭審、錄取、遴選、理論的 `intro` 也會殘留。
- **建議修法**
  - 在 store 加一個 `loadId`，每次讀檔加一，場景元件改用 ``key={`${loadId}:${scene.id}`}``。
  - 另外讓 `advance()` 檢查各場景型別的完成條件，作為第二道防線。

### C6【中】「結束調查」的兩段確認會被雙擊穿透

- **位置**：`src/ui/Desk.tsx:1317-1338`（`WrapButton`）
- **原因**
  - 待命和確認兩個狀態都是同一位置的 `<button>`，React 會沿用同一個 DOM 節點。
  - 第一下切到確認狀態後馬上重繪，雙擊的第二下就落在 `onWrap` 上。
  - `wrapDesk` 不能復原。
- **建議修法**：兩個按鈕給不同的 `key`，確認鈕出現後約 400 ms 內不接受點擊（或先 `disabled`）。

### C7【中】存檔用索引記錄場景、步數和選項，內容改版後舊存檔會錯位

- **位置**
  - `src/engine/save.ts:7-21`（`scene`、`step` 和 `choices` 的值都是索引）
  - `src/engine/game.ts:82-84`
  - `src/engine/episode/phone.ts:114-116`
- **原因**
  - 上線後只要在劇本中間插入或刪掉一個場景、一個步驟或一個選項，舊存檔就會落在錯的場景，或套到錯的選項。
  - 可能跳過陪審團遴選，`courtScene` 會退回劇本預設的陪審員。
  - 電話場景的 `step` 超出範圍時，`canAdvance` 讀 `s.do` 會丟例外，`advance()` 每次都失敗，玩家永久卡住（單元測試重現）。
  - 不存在的集數會悄悄退回 ep1（`game.ts:78-80`），`followingEpisode` 又回傳 `ep1`（`game.ts:51-53`，`indexOf` 是 -1）。
- **建議修法**
  - 存檔改存 `sceneId`，讀檔時再換算成索引。
  - 讀檔時把 `step` 夾在步數範圍內。
  - 遇到未知的集數就判為損毀。
  - 選項改用穩定的 id，或在內容改版時加 `SAVE_VERSION` 並寫遷移。

### C8【低】同一位候選人可以重複提「無理由」排除，懲罰一直疊加

- **位置**：`src/engine/episode/voirdire.ts:67-71`；按鈕不會停用（`src/ui/VoirDire.tsx:232`）。
- **原因**：沒有根據的排除聲請沒有記在候選人身上，每按一次 `wrong` 就加一（單元測試重現：同一人三次，`wrong = 3`）。加上 C2，雙擊一次會讓每個開庭日都少 2 點耐心。
- **建議修法**：記下每位候選人失敗過的排除聲請；重複送出時不動作，或直接停用按鈕。

### C9【低】聲請被駁回時設的 `motion-denied` 旗標沒有任何地方讀

- **位置**：設定在 `src/engine/episode/desk.ts:430`；說明在 `desk.ts:45` 和 `desk.ts:418-420`。
- **原因**：註解說聲請被駁回，開庭第一天會少 1 點法官耐心，但除了測試沒有程式讀這個旗標。單元測試確認，有沒有這個旗標，`courtScene` 的耐心都是 5。
- **建議修法**：在 `courtScene` 第一個開庭日把它算進去，或刪掉旗標和註解。請企劃確認。

### C10【低】主詰問中被法官斥責後，引擎沒有關掉異議窗

- **位置**：`src/engine/episode/trial.ts:172-185`（第 177 行把 `stage` 設成 `'done'`，但 `window` 仍是 true）；`letPass` 和 `object` 只檢查 `window`。
- **原因**：UI 目前蓋住了這個問題，但引擎允許在斥責之後繼續 `letPass` 或 `object`，耐心可能扣到 -1，陪審團也可能被斥責第二次（單元測試重現）。
- **建議修法**：斥責時一併設 `window: false`；`letPass` 和 `object` 也要求 `stage === 'direct'`。

### C11【低，潛在】結辯和談判只看第一個桌面的論點

- **位置**：`src/engine/game.ts:119-121`（`deskSceneOf` 用 `find`）、`src/engine/game.ts:235-239`（`closingArgs`）
- **原因**：兩集各有兩個桌面場景。現在第二個桌面只產出「只用於聲請」的論點，所以還看不出問題；之後只要有人在第二個桌面加入可以結辯的論點，它就會從結辯和攤牌消失（改內容後重現）。
- **建議修法**：`closingArgs` 改成 `heldArgs(p).filter(a => !a.motionOnly)`。

### C12【低】計時異議窗在選單打開或分頁隱藏時照樣倒數

- **位置**：`src/ui/Courtroom.tsx:146-157`
- **原因**：倒數用的是牆上時間 `Date.now()`，打開選單（例如去調整秒數）或切到別的分頁，回來時會立刻算成「不異議」。
- **建議修法**：選單打開或 `document.hidden` 時暫停，改成記剩下的毫秒數。

### C13【低】快速切換語言可能停在錯的語言

- **位置**：`src/i18n/index.ts:74-91`
- **原因**：`setLang('en')` 要等英文對照表載入。先按 English 再馬上按中文，中文會先生效，英文載完後又切回英文並寫進 localStorage。
- **建議修法**：記下最後一次要求的語言，非同步完成時如果已經不是它，就忽略。

### C14【低】畫外字幕播放中讀檔，讀屏播報可能一直停住

- **位置**：`src/ui/VoiceOver.tsx:89`、`src/ui/announce.ts:49-61`
- **原因**：只有最後一句的 `next()` 會呼叫 `announce.voiceEnd()`。選單疊在字幕上面，在字幕中讀檔會讓覆蓋層卸載，卻沒有呼叫它，之後所有播報都卡在佇列裡，直到回標題。
- **建議修法**：在 `VoiceOver` 卸載的 cleanup 裡呼叫 `announce.voiceEnd()`。

### C15【低】音檔載入失敗會被永久記住

- **位置**：`src/engine/sound.ts:127-140`（第 136 行 `.catch(() => null)` 的結果存進 `buffers`）
- **原因**：一次網路抖動之後，這首曲子整個遊戲期間都不會再播。
- **建議修法**：失敗時 `buffers.delete(name)`，下次再試。

---

## 三、效能

### P1【中】畫外字幕在停留期間每一幀都重繪整個覆蓋層（最長 7 秒）

- **位置**：`src/ui/VoiceOver.tsx:130-137`（`setP` 每個 `requestAnimationFrame` 都呼叫）、`src/ui/VoiceOver.tsx:144-154`、`src/ui/VoiceOver.tsx:66`
- **原因**
  - 每一幀都會：重新翻譯每一句（英文模式每次都掃過所有樣板正規表示式）、重算 `voTiming`、呼叫 `matchMedia`、重新產生每個字的 `<span>`。
  - 沒有依賴陣列的 effect 還會反覆移除再加回 `keydown` 監聽。
  - 另外，`voAuto` 只在每句開始時讀一次，播放中關掉自動前進不會生效。
- **建議修法**
  - 進度條改用 CSS 動畫，或用 ref 直接改 style。
  - `beats` 和 `tm` 用 `useMemo`。
  - 鍵盤監聽只註冊一次，用 ref 讀最新狀態。

### P2【中】解碼後的音樂和環境音整個遊戲期間都留在記憶體

- **位置**：`src/engine/sound.ts:77`（`buffers` Map）、`src/engine/sound.ts:127-140`
- **原因**：音樂加環境音約 306 秒，以 48 kHz 浮點 PCM 解碼後約 59 MB，輸出裝置是 96 kHz 時還要加倍。在 iOS Safari 上可能讓分頁被系統回收，連帶觸發 C1 的進度遺失。
- **建議修法**：不在播放中的音樂和環境音要釋放；或改用 `HTMLAudioElement` 搭配 `MediaElementAudioSourceNode` 串流。短音效可以繼續快取。

### P3【低】主程式 chunk 有 652 KB（gzip 197 KB），其中約 31% 是兩集中文劇本和原型模式

- **位置**：`src/content/index.ts:4-11`（`ep1`、`ep2`、`proto` 都是靜態 import）、`src/i18n/index.ts:67-72`
- **原因**
  - 兩集中文劇本（約 189 KB）和原型模式（`proto.yaml`、`Board`、`Court`）都在首次載入內。
  - 英文模式一次下載全部 8 個對照表（約 254 KB，gzip 109 KB）。
  - 上次選英文的玩家重新進來時，會先看到中文，等對照表下載完才換成英文。
- **建議修法**
  - 依 `progress.episode` 用 `import()` 延遲載入劇本。
  - 把原型模式拆成獨立的 chunk。
  - 英文對照表只載入目前這一集加共用 UI 的部分。
- **打包大小**（`vite build`；dist 總計 5.64 MB）：

| 檔案                                                          | 原始                   | gzip                  |
| ------------------------------------------------------------- | ---------------------- | --------------------- |
| `index-*.js`（主程式，立即載入）                              | 652.6 KB               | 197.3 KB              |
| `index-*.css`                                                 | 124.8 KB               | 26.5 KB               |
| 英文 `ep1` / `ep2` / `glossary`（延遲載入）                   | 110.0 / 87.3 / 21.6 KB | 45.3 / 35.7 / 10.4 KB |
| 其他英文 UI 對照表（5 個，延遲載入）                          | 共約 35 KB             | 共約 17 KB            |
| 圖片（26 個 webp＋8 個 avif，需要時才載入）                   | 1.34 MB                | —                     |
| 音檔（19 個 m4a，需要時才載入；最大的 `mus_closing` 1.13 MB） | 3.26 MB                | —                     |

- 主 chunk 的組成：
  - `react-dom` 202 KB
  - `ep1.yaml` 108 KB、`ep2.yaml` 81 KB
  - `Desk.tsx` 25 KB、`Closing.tsx` 14 KB、`game.ts` 13.5 KB
  - `glossary.ts` 11 KB、`proto.yaml` 8 KB
- zod 和 yaml 只在建置時使用，沒有打包進去。

### P4【低】時間軸每次 render 都新建一個 ResizeObserver，拖曳時每次移動都會觸發

- **位置**：`src/ui/Timeline.tsx:93-108`（`useLayoutEffect` 沒有依賴陣列）
- **原因**：每次 render 都讀 `offsetTop`（強制重新排版）並建立、斷開一個 `ResizeObserver`；拖曳時每次 `pointermove` 都會 `setDrag`。
- **建議修法**：加上依賴陣列，只保留一個 observer。

### P5【低】多個元件訂閱整個 store

- **位置**
  - `src/ui/App.tsx:27`
  - `src/ui/GameMenu.tsx:10`
  - `src/ui/Title.tsx:56`、`src/ui/Title.tsx:64`（每次 render 都 `readSave('auto')` 解析一次 JSON）
  - `src/ui/Evidence.tsx:202`（每張卡各訂閱一次）
  - `src/ui/Desk.tsx:42` 等
- **原因**：任何進度變動都會讓這些元件全部重繪。用 benchmark 量過 `game.ts` 的衍生計算，每次只要約 10–35 µs，目前影響小；但這是 P1 這類問題的放大器。
- **建議修法**：只需要動作函式的元件改用 selector（`useEpisode(s => s.save)`）；`readSave` 用 `useMemo`。

### P6【低】Web Audio 的 GainNode 用完沒有斷開

- **位置**：`src/engine/sound.ts:198-228`（`fadeOut`、`swap`）
- **原因**：每次換音樂或環境音，都會留下一個接在 bus 上的 `GainNode`。Chrome 會回收，舊版 Safari 不一定。
- **建議修法**：淡出結束後呼叫 `p.gain.disconnect()`。

### 已檢查、沒有問題的項目

- 整個遊戲只有一個 `AudioContext`，不會重複建立。
- `GameMenu`、`Evidence`、`Desk`、`Portrait`、`VoirDire`、`Pleading`、`CourtLight`、`Marks`、`Title` 裡的 `addEventListener`、`matchMedia`、`ResizeObserver`、`setTimeout`、`requestAnimationFrame` 都有清除。
- 沒有沒釋放的 object URL。
- 圖片和音檔以 URL 的形式 glob，實際檔案需要時才下載。

---

## 驗證方式

- **單元與整合測試**：`npm run typecheck`、`npm run lint`、`npm run validate:content`、`npm test`（275 個測試）、`npm run e2e`（10 個）全部通過。
- **存檔韌性**：用 Playwright 對建置後的頁面植入 14 種壞存檔，各在中、英文模式下測試，記錄「繼續」之後和重新整理之後的畫面與錯誤訊息。測試腳本沒有提交進 repo。
- **引擎問題**：C2–C4、C7–C11 用暫時性的 vitest 測試重現，跑完已刪除，repo 沒有留下變更。
- **其他問題**：C5、C6、C12–C15 和 P1–P6 是讀程式追蹤得出的。P3 的大小取自實際建置。
- **安全掃描**：`npm audit`；對 `git log --all -p`（218 個 commit）做憑證格式比對；搜尋危險的 DOM API。
