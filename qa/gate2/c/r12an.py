# 第 12 輪 1：片頭預載分析。讀 r12p/*.json 與 frames/<tag>/，印每一跑的等待、時間軸、黑段、第一幀、冷開場底圖。
import json, glob, sys, os
import numpy as np
from PIL import Image
EXP = {'paper': 0, 'blind': 10000, 'court': 17000, 'witness': 23000, 'lucas': 29000, 'mark': 34000}
files = sys.argv[1:] or sorted(glob.glob('r12p/r12-pre-*.json'))
COLD = ('apt-', '31f-', 'shelter-', 'hq-', 'bus', 'cold', 'ep2-')
def isintro(u): return u.startswith(('paper-', 'blind-', 'court-'))
cache = {}
def frame_stats(tag, tg, size):
    d = f'frames/{tag}'
    mp = f'{d}/meta.json'
    if not os.path.exists(mp): return None
    if tag in cache: return cache[tag]
    m = json.load(open(mp))
    fr = m['frames']
    out = []
    W0 = None
    for f in fr:
        try: im = Image.open(f"{d}/{f['i']:04d}.jpg").convert('L')
        except Exception: continue
        w, h = im.size
        sc = 4
        a = np.asarray(im.resize((w // sc, h // sc)), dtype=float)
        mask = np.ones_like(a, bool)
        if tg:
            k = w / (f['w'] or w) if f['w'] else 1
            # 選單鈕外擴 6px 不算
            x0 = int((tg[0] - 6) * k / sc); y1 = int((tg[1] + tg[3] + 6) * k / sc)
            mask[:max(0, y1), max(0, x0):] = False
        v = a[mask]
        out.append((f['t'], float((v > 34).mean()), float(v.mean())))
    cache[tag] = out
    return out
rows = []
for fn in files:
    for R in json.load(open(fn)):
        E = R['E']; tag = R['tag']
        g = lambda k: next((e['t'] for e in E if e['k'] == k), None)
        mount, ready, unm = g('intro-mount'), g('ready'), g('intro-unmount')
        card = next((e['t'] for e in E if e['k'] == 'card' and mount and e['t'] >= mount), None)
        paused = 0; a = None
        for e in E:
            if e['k'] == 'paused': a = e['t']
            if e['k'] == 'resumed' and a: paused += e['t'] - a; a = None
        print(f"\n=== {tag}  notes={R['notes']}")
        if not mount: print('  no intro'); continue
        # 預載：片頭圖什麼時候開始要、什麼時候全部到（相對片頭出現）
        ni = [x for x in R['net'] if isintro(x['u'])]
        if ni:
            s0 = min(x['t0'] for x in ni) - mount; s1 = max(x.get('t1', 10**13) for x in ni) - mount
            print(f"  intro imgs: n={len(ni)} req {s0/1000:+.2f}s..done {s1/1000:+.2f}s  bytes={sum(x.get('size') or 0 for x in ni)}  fails={[x['u'] for x in ni if x.get('fail')]}")
        wait = (ready - mount) if ready else None
        print(f"  wait before 0:00 = {wait/1000 if wait is not None else None}s   paused={paused/1000:.1f}s   card@ {((card or unm or 0) - (ready or mount) - paused)/1000:.2f}s after ready")
        # 時間軸
        sh = [(e['t'], e['shot']) for e in E if e['k'] == 'shot' and e['t'] >= mount]
        on = [(e['t'], e) for e in E if e['k'] == 'shot-on' and e['t'] >= mount]
        off = [e['t'] for e in E if e['k'] == 'shot-off' and e['t'] >= mount]
        line = []
        pz = 0
        for t, s in sh:
            # 暫停：只補這個鏡頭之前的暫停
            pz = 0; a = None
            for e in E:
                if e['t'] > t: break
                if e['k'] == 'paused': a = e['t']
                if e['k'] == 'resumed' and a: pz += e['t'] - a; a = None
            rel = t - (ready or mount) - pz
            o = next(((tt, e) for tt, e in on if tt >= t - 5 and e['cls'].endswith(s)), None)
            prevoff = max([x for x in off if x <= t + 5] or [None]) if off else None
            cut = (t - prevoff) if (prevoff and s != 'paper' and t - prevoff < 3000) else None
            blk = (o[0] - t) if o else None
            line.append(f"{s}@{rel/1000:.2f}(exp {EXP[s]/1000:g}) on+{blk}ms cut{cut} bad{o[1]['bad'] if o else '-'}")
        for l in line: print('   ', l)
        tx = [e for e in E if e['k'] == 'intro-text' and e['t'] >= mount and (not ready or e['t'] < ready) and e['text']]
        if tx: print('  text during wait:', tx)
        tgl = sorted(set(e['c'] for e in E if e['k'] == 'toggle'))
        print('  toggle on intro:', tgl)
        for k in ('menuOpen', 'menuLater', 'menuClosed', 'skipVisible', 'skipReady', 'afterSkip', 'waitAx'):
            if k in R: print(f'  {k}:', R[k])
        # 畫面：等待中最亮的一幀、每個鏡頭第一幀、鏡頭裡面有沒有黑段
        fs = frame_stats(tag, R.get('tg'), R['sz'])
        if fs:
            wf = [x for x in fs if mount <= x[0] < (ready or 10**13)]
            if wf: print(f"  wait frames n={len(wf)} max-nonblack={max(x[1] for x in wf):.4f} mean-lum max={max(x[2] for x in wf):.1f}")
            for i, (t, s) in enumerate(sh):
                tend = sh[i + 1][0] if i + 1 < len(sh) else (unm or t + 4000)
                o = next((tt for tt, e in on if tt >= t - 5 and e['cls'].endswith(s)), None)
                ff = [x for x in fs if (o or t) <= x[0] < tend]
                if not ff: continue
                first = next((x for x in ff if o and x[0] >= o), None)
                blackrun = [x for x in ff if x[1] < 0.01]
                # 鏡頭中段（扣掉頭尾 150ms）黑的幀
                mid = [x for x in ff if (o or t) + 150 < x[0] < tend - 150 and x[1] < 0.01]
                print(f"    frames {s:8} n={len(ff):4} black={len(blackrun):3} midBlack={len(mid):3} first(after on)+{(first[0]-o) if first else '-'}ms nb={first[1] if first else '-':.3}" if first else f"    frames {s:8} n={len(ff)} black={len(blackrun)} midBlack={len(mid)} (shot never on)")
        # 冷開場底圖：每張出現（vis）距前一次按的時間
        pr = [p[0] for p in R['presses']]
        cold = []
        for u, o in sorted(R['IMG'].items(), key=lambda x: x[1]['first']):
            if o['intro'] or isintro(u) or not o.get('first'): continue
            if not u.endswith(('.jpg', '.webp', '.avif', '.png')): continue
            vis = o.get('vis')
            before = max([p for p in pr if p <= o['first'] + 50] or [R['tStart']])
            n = next((x for x in R['net'] if x['u'] == u), None)
            cold.append((u.split('-')[0] + '-' + u.split('-')[1], (vis - before) if vis else None, (n['t1'] - n['t0']) if n and n.get('t1') else None))
        if cold: print('  cold plates (wait after press ms, net ms):', cold)
        rows.append({'tag': tag, 'wait': wait, 'cold': cold})
json.dump(rows, open('r12p/an-rows.json', 'w'), ensure_ascii=False, indent=1)
