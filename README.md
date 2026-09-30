# 《合理懷疑》（代號 LawGame）

美式律政劇風格的 2D 敘事推理遊戲（卷宗桌面風）。企劃書 v2.0 在專案資料夾 `gdd/`。

目前是**原型**：只驗證證據板與推理鏈、彈劾三步驟、12 位陪審員的反應（企劃書第 15 節）。

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

- `src/content/proto.yaml`：原型劇本（卡片、推理鏈疑問、陪審員、證人證詞），載入時用 Zod 驗證。
- `src/engine/board.ts`：證據板（提交花工時、整條全對才確認）。
- `src/engine/cross.ts`：交互詰問（鎖定、鋪陳、對質、法官耐心、結辯）。
- `src/engine/jury.ts`：12 位陪審員的心證、表情、三輪評議與判決。
- `src/engine/validate.ts`：劇本驗證器。
- `src/ui/`：畫面（證據板、法庭、判決）。
