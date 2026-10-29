# 人物立牌（standee）

底圖上站的人：全身剪影，場景光影 #2 的設定（standee-mock v2：身體 `#07090c`、每人最多一條邊光、腳落在底圖原有的接觸影子上）。

- `figs.py`：人形（照骨架畫，公尺為單位）。`standee.py`：遮罩、邊光、線性光裡疊的算法（示意圖用的原檔）。
- `cfg-*.json`：每一組（一場戲）的人、腳底與頭頂座標（2304×1440 算圖解析度）、顏色與邊光、套用到哪幾張底圖（`plates`）。
- `render.py`：每人每個版本（桌機 1440×900、手機 720×1280）畫成一張透明 PNG，寫到 `src/ui/plates/standee/`，
  位置寫到 `src/ui/plates/standees.json`。遊戲（`src/ui/scenePlate.tsx`）照 json 把它們疊在底圖上，位置用圖上的百分比。

```
python3 tools/standee/render.py      # 需要 numpy、Pillow
```

改人形、座標或邊光：改這裡的檔案、重跑、把新的 PNG 和 json 一起 commit。S6 的座標與手機裁切（`phone_crop_px`）要和
`src/ui/plates/plates.json` 一致（場景光影的 PR 會一起更新）。
