# 第二道關卡量測腳本（原樣，2026-11-16 交給 CI）

> repo 版（2026-11-16）：寫死的路徑改成環境變數——playwright 用 repo 的 `playwright`、瀏覽器可用 `PW_CHROMIUM` 指定、輸出 `OUTDIR`、repo 根目錄 `REPO_ROOT`（預設目前目錄）。`package.json` 設 commonjs。CI 已接上的：第 14 項 `ci-camera.sh`（ci.yml 的 camera 工作，合併後跑）；第 1 項規則 1 掃描 `e2e/rule1.spec.ts`（判定本體 `b/work14/rules8.js` 原樣複製成 `e2e/rule1/rules8.cjs`，1366、412 在 PR 跑，1530、1920、390 合併後跑）。第 10 項無障礙名稱逐顆比對 `e2e/a11y-names.spec.ts`（同一組狀態，基準在 `e2e/scan/a11y-names/`，改了按鈕的字跑 `npm run a11y:names` 更新）。`c/frames.py` 加了 `cameraLayerLightToggle`：只算鏡頭層還在的幀，鏡頭層退場後落在暗底圖上的不算。

這些腳本都是從檢查員的資料夾原樣複製過來的，沒有改寫，這次也沒有重跑。

## 共通說明
- 三個資料夾各配一份自己的 `lib.js`，不能互換：
  - `a/` 原本負責 Ep1
  - `b/` 原本負責 Ep2
  - `c/` 原本負責全域
- 腳本都靠相對路徑讀 lib.js（`../lib.js` 或 `./lib`），所以子資料夾的結構要保持原樣。
- 共通環境變數：
  - `BASE=http://localhost:<埠>`：一定要寫完整網址，不給的話預設是 4189。
  - 截圖前綴：a 用 `SHOTPFX`，b、c 用 `PREFIX`。
  - `NOINTRO=1`：跳過片頭。
  - c 另外有 `OUTDIR`（輸出資料夾）和 `CONSOLELOG=<檔>`（主控台錯誤寫成 jsonl）。
- 寫死、CI 要改的路徑：
  - playwright：`/opt/node22/...`（a）、`/opt/node-tools/...`（c）。
  - 輸出：`/tmp/claude-0/ux-1106{a,b,c}/`、`shots/`。
  - repo：`/home/user/LawGame/e2e/fixtures/hung-jury.json`、`court-kowalski.json`、`/home/user/LawGame/src/ui/enNames.ts`、`lineUnits.ts`。
  - `a/py/stage14.py` 的圖片快取寫死在舊 session 的 scratchpad。
- 字型：第一次跑會用 curl 抓 Google Fonts，存到 `fontcache/`。字型快取沒有一起複製。一定要用真字型，換成 fallback 字型量出來的換行是錯的。
- 分析用的 .py 需要 numpy 和 PIL。

## 第 1 項：規則 1（出框、切字、重疊、離選單鈕 <8 px）
- **`b/work14/rules8.js`**：判定本體，傳給 `page.evaluate(rules8, names)`。
  - 回傳 over、menu、cut、btn、overlap、menuBox 幾類。
  - 判讀時這兩種不算：cut 裡標 `scroll:true` 的，以及 btn 的 other 不是 `text:` 開頭的。
- **`b/work14/scan14.js`**：兩集的對白頁和證據板。
  - 用法：`BASE=… PREFIX=x- node scan14.js m360 zh ep1:2:blank ep2:10:board2`
  - seed 可以是 blank、hung、board1、board2、board2b。
  - 輸出 `scan14-<埠>.jsonl`。
  - 新舊比對：`python3 a14.py`，檔名寫死成 4189 對 4190。
- **`b/work13/scan13.js`**：Ep2 的 464 個狀態，字級 1.25 或 1.5。
  - 用法：`node scan13.js <size> <lang> <scale> [idx,…]`
  - 比對：`a12.py`。
- **`a/scripts/labels8.js`**：Ep1 的 19 個點加法庭，量出框、被裁、專名拆行、斷行、離選單鈕、撐寬。
  - 用法：`cd a/scripts && NOINTRO=1 BASE=… SHOTPFX=ci- node labels8.js m320,m360 zh,en 1.25,1.5`
- **`a/scripts/near7.js` 加 `nearsum.js`**：只量離選單鈕的距離，可以跑更多尺寸。
  - 用法：`node nearsum.js ci-`
- **`c/r8-scan.js`**：逐頁排字掃描（38 頁），量出框、詞中斷、末行孤字、省略號、頁寬超出。
  - 用法：`OUTDIR=… PREFIX=… BASE=… NOINTRO=1 node r8-scan.js <320|360|412> <zh|en> <字級> <light|dark> <tag> [頁碼] > sc-<tag>.log`
  - 視窗高寫死成 740。
  - 比對：`python3 sum10sc.py <新> <舊>`（412 的話用 `r13s3-sum.py`）。這兩支的「old」那一行是空的，是已知的小錯。
- **`c/r8-topbar.js`**：12 頁的頂列 × 中英 × 3 種字級，量離選單鈕的距離，重疊時是負數。
  - 比對：`sum10tb.py`
- **`c/r8-tour.js`**：整站導覽，代號 N1–8 是窄版，W1–8 是寬版。
  - 比對：`cmp10.py`
- **`c/r13-menu.js`**：選單面板。
- **`c/r10/runall.sh`**：一次跑完整套窄版回歸。
  - 用法：`r10/runall.sh <outdir> <prefix> <base完整網址>`
  - 會依序跑 r8-scan、r8-tour、r10-camera、r7-iv、r2-esc、r8-topbar、r3-cine。
- **`a/scripts/stage14.js` 加 `a/py/stage14.py`**：盧卡斯大立繪的位置、重疊、側緣。
- **缺口**：除了頂列和選單面板，其他頁面「兩個不同元素互相重疊」沒有通用腳本，當時是看截圖判斷的。

## 第 10 項：無障礙名稱和上一版比對
- **`b/work14/scan14.js` 加 `a14.py`**：唯一能逐顆比對的。
  - 用 CDP 讀完整無障礙樹，存每顆按鈕的名稱、畫面字、aria-label，同一狀態排序後逐顆比。
  - `b/work13/ax12.py` 另外列出多餘空白、nbsp、「名稱≠畫面字」。注意它印出的 4189 和 4190 是標反的。
- **`c/r8-scan.js`**：只存按鈕數和異常，例如箭頭字元、多餘空白、名稱和畫面字不符、換行，不存完整名稱。
- **`a/scripts/labels8.js`**：只存有問題的名稱。
- **`c/r6-axname.js`、`c/r13-menu.js`、`c/r11-intro.js`（ax 模式）**：只存局部的完整名稱。
- **缺口**：全站「每個名稱逐字 diff」只有 b 的 Ep2 和證據板做到了。要擴到全站，得在 r8-scan 存下所有名稱。

## 第 12 項：動態稽核（回彈、震動、scale >1.04）
- **沒有腳本。** 以前是人工做的：
  - 片頭用 `c/r11-intro.js rec:<size>:<lang>:<ep>` 逐鏡頭讀 computed transform，再人工對照 1.04。
  - `a/scripts/intro11.js` 逐幀記片頭的放大倍數。
  - `a/scripts/anim.js` 逐幀記指定元素，只有寫死的幾個 case。
  - 回彈和震動是看錄影的幀，人工判斷。
- CI 要做這項得新寫。

## 第 14 項：黑底鏡頭層的選單鈕顏色
- **`c/r10-camera.js`**：最新最完整，涵蓋 25 個情境：冷開場、22:33 插入、23:14、場景卡、幕卡、日卡、集尾、尾聲、判決。
  - 每個 rAF 加上 MutationObserver，讀選單鈕的底色、字色、框色，並錄下影格。
  - 用法：`OUTDIR=… PREFIX=… BASE=… LANGX=zh node r10-camera.js p7,320,1530 light <情境…> <tag>`
  - 像素驗證：`FROOT=<OUTDIR>/frames python3 frames.py`，印出黑底上出現淺色鈕的幀數。
- **`c/r13-pre.js` 加 `r12an.py`**：片頭期間選單鈕顏色每變一次就記一筆。只有 computed style，沒有像素驗證。
  - 用法：`node r13-pre.js e1new:1440:zh:none`
  - 要在 OUTDIR 裡執行，而且 `r13p/` 要先建好。
- **`a/scripts/menulight.js`**：只測淺色主題。底 >60 或字 <160 算 BAD。最後一次跑是 11-06，那時還沒有片頭。
- **`b/work13/walk8r.js`**：只記底色。
- **`b/work3/cine3.js`、`opening2.js`**：底色和字色都記，但這是第 3 輪的舊腳本，不保證現在還能跑。
