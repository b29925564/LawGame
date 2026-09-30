# 《合理懷疑》（代號 LawGame）

美式律政劇風格的 2D 敘事推理遊戲（卷宗桌面風）。企劃書 v2.0 在專案資料夾 `gdd/`。

目前是**垂直切片**：第 1 集的冷開場、第一幕（接案與訪談）、第二幕前半（桌面調查與第一條推理鏈），以及柯瓦斯基警探的完整庭審（異議與彈劾三步驟）。標題畫面仍可進入舊的系統原型。

## 開發

```sh
npm install
npm run dev              # 本機開發伺服器
npm run typecheck        # 型別檢查
npm run lint             # ESLint + Prettier
npm test                 # 單元測試與劇本驗證器
npm run e2e              # 自動通關測試（Playwright）
```

## 結構

- `src/content/ep1.yaml`：第 1 集劇本（場景流程），載入時用 Zod 驗證，並由劇本驗證器檢查。
- `src/engine/episode/`：場景引擎。`phone.ts` 冷開場、`interview.ts` 訪談、`desk.ts` 桌面調查與推理鏈、`trial.ts` 庭審（異議、彈劾三步驟、法官耐心）、`validate.ts` 集數劇本驗證器。
- `src/engine/settings.ts`、`src/engine/sound.ts`：輔助選項與音效（音效即時合成，還沒有音檔）。
- `src/engine/save.ts`：存檔（換場自動存檔、3 格手動存檔、版本號與遷移）。
- `src/engine/game.ts`：集數進度與存讀檔。
- `src/content/proto.yaml`：原型劇本（卡片、推理鏈疑問、陪審員、證人證詞），載入時用 Zod 驗證。
- `src/engine/board.ts`：證據板（提交花工時、整條全對才確認）。
- `src/engine/cross.ts`：交互詰問（鎖定、鋪陳、對質、法官耐心、結辯）。
- `src/engine/jury.ts`：12 位陪審員的心證、表情、三輪評議與判決。
- `src/engine/validate.ts`：劇本驗證器。
- `src/ui/`：畫面（證據板、法庭、判決）。
