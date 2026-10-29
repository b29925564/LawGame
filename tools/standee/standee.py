# python3 standee.py preview OUT.png            figures side by side on grey (shape check)
# python3 standee.py scene CONFIG.json OUTDIR    composite onto the shipped desktop / phone plates + 160 px + 3x crops
import sys, json, math, os
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from figs import FIG, top_of

SS = 4

def catmull(pts, n=10):
    """closed Catmull-Rom (centripetal-ish uniform) through pts"""
    P = np.asarray(pts, np.float64); m = len(P); out = []
    for i in range(m):
        p0, p1, p2, p3 = P[(i - 1) % m], P[i], P[(i + 1) % m], P[(i + 2) % m]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return out

def fig_mask(name, feet, crown, h_m, size, flipx=False):
    """supersampled mask (SS×) in a box around the figure; feet/crown in target px. Returns (mask float, x0, y0) at SS scale."""
    parts = FIG[name]; top = top_of(parts); k = (feet[1] - crown[1]) / top        # px per metre-of-drawing (top of drawing = crown)
    W, H = size; xs = []
    polys = []
    for _, pts in parts:
        c = catmull([((-x if flipx else x), y) for x, y in pts])
        q = [(feet[0] + (crown[0] - feet[0]) * (y / top) + x * k, feet[1] - y * k) for x, y in c]
        polys.append(q); xs += q
    x0 = int(math.floor(min(p[0] for p in xs))) - 12; x1 = int(math.ceil(max(p[0] for p in xs))) + 12
    y0 = int(math.floor(min(p[1] for p in xs))) - 12; y1 = int(math.ceil(max(p[1] for p in xs))) + 12
    size_ = ((x1 - x0) * SS, (y1 - y0) * SS)
    m = Image.new('L', size_, 0); d = ImageDraw.Draw(m); hm = Image.new('L', size_, 0); dh = ImageDraw.Draw(hm)
    fm = Image.new('L', size_, 0); dfm = ImageDraw.Draw(fm)
    for (pn, _), q in zip(parts, polys):
        d.polygon([((x - x0) * SS, (y - y0) * SS) for x, y in q], fill=255)
        if pn in ('head', 'hair'): dh.polygon([((x - x0) * SS, (y - y0) * SS) for x, y in q], fill=255)
        if pn == 'forearm': dfm.polygon([((x - x0) * SS, (y - y0) * SS) for x, y in q], fill=255)
    hm = {'head': np.asarray(hm, np.float32) / 255, 'forearm': np.asarray(fm, np.float32) / 255}
    hip_y = (feet[1] - 0.84 * k - y0) * SS   # hip line in mask rows (legs: hip -> feet gradient)
    return np.asarray(m, np.float32) / 255, x0, y0, hm, hip_y, (feet[1] - y0) * SS

def shifted(m, dx, dy):
    """m moved by (dx, dy) SS-pixels, zero fill"""
    out = np.zeros_like(m); h, w = m.shape
    sx, sy = int(round(dx)), int(round(dy))
    if abs(sx) >= w or abs(sy) >= h: return out
    ys0, ys1 = max(0, -sy), min(h, h - sy); xs0, xs1 = max(0, -sx), min(w, w - sx)
    out[ys0 + sy:ys1 + sy, xs0 + sx:xs1 + sx] = m[ys0:ys1, xs0:xs1]
    return out

def edge_band(m, d, w, reach):
    """pixels of m that the light reaches within w SS-px of the surface: m(p) = 1 and m(p + d*s) = 0 for every s in [w, reach]
    (unit screen vector d towards the light, y down). The reach test keeps the rim off edges another part of the body shades
    (the torso edge behind an arm, the inside of the far leg)."""
    g = int(min(3, w - 1)); md = m.copy()   # slits under ~1.5 px (arm against waist) count as closed: no light ticks inside them
    for dy in range(-g, g + 1):
        for dx in range(-g, g + 1): md = np.maximum(md, shifted(m, dx, dy))
    blocked = np.zeros_like(m); s = float(w) + g   # the dilation must not eat into the lit band
    while s <= reach:
        blocked = np.maximum(blocked, shifted(md, -d[0] * s, -d[1] * s)); s += SS
    return np.clip(m - blocked, 0, 1)

def box_blur(a, r):
    if r <= 0: return a
    k = 2 * r + 1; p = np.pad(a, r, mode='edge'); c = p.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)

def srgb2lin(c): c = np.asarray(c, np.float64); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin2srgb(c): c = np.clip(np.asarray(c, np.float64), 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
def hex2rgb(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float64) / 255

def shade(fig, scale):
    """fig: dict(body=hex, lights=[dict(dir=[dx,dy] screen y-down, color=hex, width=px@desktop, alpha, soft=px, band=px, band_alpha)])
    returns per-pixel colour (sRGB float) and alpha at SS scale"""
    m = fig['_mask']; body = srgb2lin(hex2rgb(fig['body']))
    col = np.zeros(m.shape + (3,)) + body
    if fig.get('lower'):   # legs: torso value at the hip line down to the measured lower-leg value at the feet
        rows = np.arange(m.shape[0], dtype=np.float64)[:, None, None]
        t = np.clip((rows - fig['_hip']) / max(1.0, fig['_foot'] - fig['_hip']), 0, 1)
        col = col * (1 - t) + srgb2lin(hex2rgb(fig['lower'])) * t
    if fig.get('head'):
        hm = box_blur(fig['_hm']['head'], SS)[..., None]
        col = col * (1 - hm) + srgb2lin(hex2rgb(fig['head'])) * hm
    for L in fig.get('lights', []):
        d = np.asarray(L['dir'], np.float64); d = d / np.linalg.norm(d); c = srgb2lin(hex2rgb(L['color']))
        if L.get('part'):   # a lit line inside the silhouette on one part's lit edge (spec J3: forearm upper edge, 1.3 px)
            pm = fig['_hm'][L['part']]
            r = box_blur(edge_band(pm, d, L['width'] * SS * scale, fig['_reach'] * 0.3), max(0, int(L.get('soft', 0.3) * SS * scale))) * pm * m
            col = col * (1 - L['alpha'] * r[..., None]) + c * L['alpha'] * r[..., None]
            continue
        if L.get('band'):   # lit side: a broad soft band in the light's colour (spec: key band, 10 %)
            b = box_blur(edge_band(m, d, L['band'] * SS * scale, fig['_reach']), max(1, int(L['band'] * SS * scale * 0.35))) * m
            cb = srgb2lin(hex2rgb(L.get('band_color', L['color'])))
            col = col * (1 - L['band_alpha'] * b[..., None]) + cb * L['band_alpha'] * b[..., None]
        if L.get('width'):
            r = edge_band(m, d, L['width'] * SS * scale, fig['_reach'])
            r = box_blur(r, max(0, int(L.get('soft', 0.4) * SS * scale))) * m
            col = col * (1 - L['alpha'] * r[..., None]) + c * L['alpha'] * r[..., None]
    return col, m

def composite(img, figs, scale):
    """img: PIL RGB target; figs: list (far to near) with _feet/_crown in target px. Linear-light over, then SS box-down."""
    a = srgb2lin(np.asarray(img, np.float64) / 255)
    for f in figs:
        mk, x0, y0, f['_hm'], f['_hip'], f['_foot'] = fig_mask(f['fig'], f['_feet'], f['_crown'], f['h'], img.size, f.get('flip', False))
        f['_mask'] = mk; f['_reach'] = 0.30 * (f['_feet'][1] - f['_crown'][1]) / 1.78 * SS   # 30 cm of body
        col, m = shade(f, scale)
        hs, ws = m.shape; h, w = hs // SS, ws // SS
        prem = (col * m[..., None]).reshape(h, SS, w, SS, 3).mean((1, 3)); al = m.reshape(h, SS, w, SS).mean((1, 3))
        ya, yb, xa, xb = max(0, y0), min(a.shape[0], y0 + h), max(0, x0), min(a.shape[1], x0 + w)
        f['_bbox'] = [x0, y0, x0 + w, y0 + h]
        if ya >= yb or xa >= xb: print('outside', f['name'], f['_bbox'], a.shape); continue
        sub = (slice(ya - y0, yb - y0), slice(xa - x0, xb - x0))
        a[ya:yb, xa:xb] = a[ya:yb, xa:xb] * (1 - al[sub][..., None]) + prem[sub]
        f['_bbox'] = [x0, y0, x0 + w, y0 + h]
    return Image.fromarray((lin2srgb(a) * 255 + 0.5).astype(np.uint8))

if __name__ == '__main__' and sys.argv[1] == 'preview':
    names = ['ethan_cuffed', 'ethan_lookback', 'bailiff', 'lucas_back', 'lucas_front', 'sister']
    im = Image.new('RGB', (200 * len(names), 520), (170, 170, 170))
    figs = [dict(fig=n, h=1.78, _feet=(100 + 200 * i, 500), _crown=(100 + 200 * i, 500 - 460 * (1.68 if n == 'sister' else 1.78) / 1.82),
                 body='#07090c', lights=[dict(dir=[-1, 0], color='#fffef2', width=2, alpha=0.8), dict(part='forearm', dir=[0, -1], color='#9aa3a5', width=1.3, alpha=0.9)]) for i, n in enumerate(names)]
    composite(im, figs, 1.0).save(sys.argv[2])

def lab(rgb):   # sRGB 0..1 -> CIE L*a*b* (D65)
    l = srgb2lin(rgb); M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    X, Y, Z = (l @ M.T).T if l.ndim == 2 else M @ l
    def f(t): return np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)
    fx, fy, fz = f(X / 0.9505), f(Y), f(Z / 1.089)
    return np.array([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)])

def run_scene(cfg, outdir):
    os.makedirs(outdir, exist_ok=True); sid = cfg['id']; R = cfg['frames_res']
    res = {}
    for tag, path, sc, ox in (('desktop', cfg['desktop'], 1440 / R[0], 0), ('phone', cfg['phone'], 720 / (cfg['phone_crop_px'][2] - cfg['phone_crop_px'][0]), cfg['phone_crop_px'][0])):
        im = Image.open(path).convert('RGB'); figs = []
        for p in cfg['people']:   # far to near
            f = dict(p); f['_feet'] = ((p['feet_px'][0] - ox) * sc, p['feet_px'][1] * sc); f['_crown'] = ((p['crown_px'][0] - ox) * sc, p['crown_px'][1] * sc)
            figs.append(f)
        out = composite(im, figs, sc / (1440 / R[0]))
        fn = os.path.join(outdir, f'{sid}-standee-{tag}.jpg'); out.save(fn, quality=92)
        res[tag] = {f['name']: {'feet_px': [round(v, 1) for v in f['_feet']], 'crown_px': [round(v, 1) for v in f['_crown']],
                                'height_px': round(f['_feet'][1] - f['_crown'][1], 1), 'bbox': f['_bbox']} for f in figs}
        if tag == 'desktop':
            out.resize((160, 100), Image.LANCZOS).save(os.path.join(outdir, f'{sid}-standee-160.png'))
            for f in figs:   # 3x review crop around each person (nearest, so the edge pixels stay readable)
                x0, y0, x1, y1 = f['_bbox']; pad = 20
                c = out.crop((max(0, x0 - pad), max(0, y0 - pad), min(1440, x1 + pad), min(900, y1 + pad)))
                k = 3 if c.size[1] < 300 else 2
                c.resize((c.size[0] * k, c.size[1] * k), Image.NEAREST).save(os.path.join(outdir, f"{sid}-standee-x{k}-{f['name']}.png"))
    json.dump(res, open(os.path.join(outdir, f'{sid}-standee-placement.json'), 'w'), ensure_ascii=False, indent=1)
    return res

if __name__ == '__main__' and sys.argv[1] == 'scene':
    print(json.dumps(run_scene(json.load(open(sys.argv[2])), sys.argv[3]), ensure_ascii=False))
