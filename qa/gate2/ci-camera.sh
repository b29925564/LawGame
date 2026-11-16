#!/usr/bin/env bash
# process-v2 第 5 節第 14 項：黑底鏡頭層（冷開場、插入、幕卡、場景卡、日卡、集尾、尾聲、判決，共 25 個情境）切進切出時，
# 選單鈕逐幀量像素，黑底上不能出現淺色鈕。腳本是體驗評測的 c/r10-camera.js＋frames.py，原樣搬來。
# 用法（repo 根目錄，preview 已在 4173）：qa/gate2/ci-camera.sh <輸出資料夾> [尺寸，預設 p7,1530]
set -euo pipefail
OUT=${1:?輸出資料夾}
SIZES=${2:-p7,1530}
mkdir -p "$OUT"
export OUTDIR="$OUT" REPO_ROOT="$PWD" BASE="${BASE:-http://localhost:4173}" LANGX=zh
node qa/gate2/c/r10-camera.js "$SIZES" light "" ci | tee "$OUT/camera.jsonl"
(cd "$OUT" && FROOT="$OUT/frames" python3 -I "$REPO_ROOT/qa/gate2/c/frames.py" | grep -v '^    ')
python3 -I - "$OUT" <<'PY'
import json, sys, glob
out = sys.argv[1]
bad = []
for line in open(f'{out}/camera.jsonl'):
    line = line.strip()
    if line.startswith('{'):
        r = json.loads(line)
        if 'ERR' in r.get('note', ''): bad.append(f"{r['tag']}：{r['note']}")
for k, v in json.load(open(f'{out}/frames-all.json')).items():
    if v['cameraLayerLightToggle']: bad.append(f"{k}：黑底鏡頭層上淺色選單鈕 {v['cameraLayerLightToggle']} 幀")
print('\n'.join(bad) or '選單鈕顏色：全部通過')
sys.exit(1 if bad else 0)
PY
