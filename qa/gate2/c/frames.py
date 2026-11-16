import json, sys, os, glob
import numpy as np
from PIL import Image
root = os.environ.get('FROOT', 'frames')
pat = sys.argv[1] if len(sys.argv) > 1 else '*'
res = {}
for d in sorted(glob.glob(f'{root}/{pat}')):
    mp = f'{d}/meta.json'
    if not os.path.exists(mp): continue
    m = json.load(open(mp))
    tg = m.get('tg')
    if not tg: print(os.path.basename(d), 'no toggle'); continue
    mobile = m['size'] in ('p7', 360, 320)
    S = m['S']
    def dom(t):
        e = None
        for x in S:
            if x['t'] <= t: e = x
        return e
    import statistics
    WMED = statistics.median([f['w'] for f in m['frames'] if f['w']] or [0])
    rows = []
    for f in m['frames']:
        e = dom(f['t'])
        if not e or not e.get('bg'): rows.append((f['t'], None, None, '')); continue
        im = np.asarray(Image.open(f"{d}/{f['i']:04d}.jpg").convert('L'), dtype=float)
        H, W = im.shape
        sc = W / WMED if WMED else 1
        x = (tg[0] + 6) * sc
        y = (tg[1] + tg[3] / 2 - (f['sy'] if mobile else 0)) * sc
        if y < 3 or y > H - 3: rows.append((f['t'], None, None, '')); continue
        tl = im[int(y) - 2:int(y) + 3, int(x) - 2:int(x) + 3].mean()
        mask = np.ones_like(im, bool)
        mask[max(0, int((tg[1] - 4 - (f['sy'] if mobile else 0)) * sc)):int((tg[1] + tg[3] + 4) * sc), int((tg[0] - 4) * sc):] = False
        scr = im[mask].mean()
        rows.append((f['t'], tl, scr, e.get('layer') or ''))
    cls = lambda v: None if v is None else ('L' if v > 225 else 'D' if v < 45 else 'M')
    seq = []
    for t, tl, scr, _ in rows:
        c = cls(tl)
        s = None if scr is None else ('blk' if scr < 50 else 'lit' if scr > 150 else 'mid')
        k = (c, s)
        if seq and seq[-1][0] == k: seq[-1][1] += 1; seq[-1][3] = t
        else: seq.append([k, 1, t, t, tl, scr])
    bad_blk_light = sum(1 for t, tl, scr, _ in rows if tl is not None and tl > 225 and scr < 50)
    # CI（2026-11-16）：只算 DOM 上鏡頭層（冷開場、插入、幕卡、場景卡、判決…）還在的幀；鏡頭層退場後落在暗的場景底圖上不算。
    bad_layer_light = sum(1 for t, tl, scr, ly in rows if ly and ly != '-' and tl is not None and tl > 225 and scr < 50)
    mid = [(round(t - m['t0']), round(tl)) for t, tl, scr, _ in rows if tl is not None and 45 <= tl <= 225]
    out = {'n': len(rows), 'blackScreenLightToggle': bad_blk_light, 'cameraLayerLightToggle': bad_layer_light, 'midToggle': mid[:10], 'nMid': len(mid),
           'seq': [f"{k[0]}/{k[1]} x{n} @{round(a - m['t0'])}..{round(b - m['t0'])} tl{round(tl) if tl is not None else '-'} scr{round(scr) if scr is not None else '-'}" for k, n, a, b, tl, scr in seq]}
    res[os.path.basename(d)] = out
    print(os.path.basename(d), 'frames', out['n'], 'blk+light', bad_blk_light, 'mid', out['nMid'], out['midToggle'])
    for s in out['seq']: print('   ', s)
json.dump(res, open(f'frames-{pat.replace("*", "all")}.json', 'w'), indent=1)
