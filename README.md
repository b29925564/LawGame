# LawGame

美式律政劇風格的 2D 敘事推理遊戲（卷宗桌面風）。每個案件是一「集」：事件 → 調查蒐證 → 開庭攻防。

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

- `src/content/*.yaml`：案件劇本（證據、文件、證詞），載入時用 Zod 驗證。
- `src/engine/`：資料結構、劇本驗證器、交互詰問規則、遊戲狀態（Zustand，存在 localStorage）。
- `src/ui/`：畫面（事件、桌面調查、證據板、法庭、判決）。
