# 人物立牌：把示意圖用的人形（figs.py、standee.py，場景光影 #2 的 standee-mock v2）各畫成一張透明 PNG，
# 遊戲裡照 src/ui/plates/standees.json 疊在底圖上。
#   python3 tools/standee/render.py
# 輸出：src/ui/plates/standee/<組>-<人>-<desktop|phone>.png 和 src/ui/plates/standees.json
# 座標（feet_px / crown_px）是 2304×1440 算圖解析度；桌機底圖 1440×900，手機底圖是裁切 phone_crop_px 之後縮成 720×1280。
# 顏色、邊光是 cfg-*.json（身體 #07090c、每人最多一條邊光）。線性光裡疊、4 倍超取樣再縮小，和示意圖一樣；
# 這裡只輸出人（預乘色除回 alpha），底圖由瀏覽器疊。
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from standee import SS, fig_mask, shade, lin2srgb  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'src', 'ui', 'plates')
# 瀏覽器在 sRGB 裡疊圖，示意圖是在線性光裡疊：半透明的邊緣像素（深色身體疊在較亮的底上）會比示意圖暗一點。
# alpha 取 1-(1-a)^0.55 補回來（對 #07090c 這種近黑的身體，疊出來的值最接近線性光；對示意圖逐點比，離群像素減半）。
EDGE = 0.55
SIZE = {'desktop': (1440, 900), 'phone': (720, 1280)}


def layer(person, tag, cfg):
    R = cfg['frames_res']
    if tag == 'desktop':
        sc, ox = 1440 / R[0], 0
    else:
        x0c, _, x1c, _ = cfg['phone_crop_px']
        sc, ox = 720 / (x1c - x0c), x0c
    f = dict(person)
    f['_feet'] = ((person['feet_px'][0] - ox) * sc, person['feet_px'][1] * sc)
    f['_crown'] = ((person['crown_px'][0] - ox) * sc, person['crown_px'][1] * sc)
    mk, x0, y0, f['_hm'], f['_hip'], f['_foot'] = fig_mask(f['fig'], f['_feet'], f['_crown'], f['h'], SIZE[tag], f.get('flip', False))
    f['_mask'] = mk
    f['_reach'] = 0.30 * (f['_feet'][1] - f['_crown'][1]) / 1.78 * SS
    col, m = shade(f, sc / (1440 / R[0]))
    hs, ws = m.shape
    h, w = hs // SS, ws // SS
    prem = (col * m[..., None]).reshape(h, SS, w, SS, 3).mean((1, 3))
    al = m.reshape(h, SS, w, SS).mean((1, 3))
    straight = np.where(al[..., None] > 1e-6, prem / np.maximum(al[..., None], 1e-6), 0)
    rgb = (lin2srgb(straight) * 255 + 0.5).astype(np.uint8)
    edge = 1 - (1 - al) ** EDGE
    rgba = np.dstack([rgb, (edge * 255 + 0.5).astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA'), (x0, y0, w, h), f


def main():
    os.makedirs(os.path.join(OUT, 'standee'), exist_ok=True)
    sets = {}
    for name in sorted(os.listdir(HERE)):
        if not (name.startswith('cfg-') and name.endswith('.json')):
            continue
        cfg = json.load(open(os.path.join(HERE, name)))
        sid = cfg['id']
        people = []
        for p in cfg['people']:  # 遠到近
            entry = {'id': p['name'], 'fig': p['fig']}
            for tag in ('desktop', 'phone'):
                img, (x, y, w, h), f = layer(p, tag, cfg)
                fn = f"{sid}-{p['name']}-{tag}.png"
                img.save(os.path.join(OUT, 'standee', fn), optimize=True)
                a = np.asarray(img)[..., 3]
                cols = np.where((a > 40).any(axis=0))[0]
                top = int(round(f['_crown'][1] - y)); hh = int(round(0.13 * (f['_feet'][1] - f['_crown'][1])))
                hc = np.where((a[max(0, top):top + hh] > 40).any(axis=0))[0]
                entry[tag] = {
                    'file': fn,
                    'ink': [int(x + cols.min()), int(x + cols.max() + 1)],
                    'head': [int(x + hc.min()), int(x + hc.max() + 1)],
                    'box': [x, y, w, h],
                    'feet': [round(f['_feet'][0], 1), round(f['_feet'][1], 1)],
                    'crown': [round(f['_crown'][0], 1), round(f['_crown'][1], 1)],
                }
            people.append(entry)
        # 手機／窄視窗照 cover 裁左右時，舞台怎麼對齊視窗：at = 圖上的那一點（圖寬的比例）要落在視窗寬的 to 處。
        # 預設 at＝人群外框中心、to＝0.5（置中）；cfg 的 fit.<版本> 可改成 edge=right：人群右緣離右邊 margin，
        # 不夠的寬度全部從左邊那一側扣（羈押室手機：三個人佔圖寬 85%，放不下，優先頭、遠景的人完整，前景盧卡斯的身體可被左緣切）。
        anchor = {}
        for tag in ('desktop', 'phone'):
            lo = min(p[tag]['ink'][0] for p in people)
            hi = max(p[tag]['ink'][1] for p in people)
            fit = cfg.get('fit', {}).get(tag, {})
            if fit.get('edge') == 'right':
                anchor[tag] = {'at': round(hi / SIZE[tag][0], 4), 'to': round(1 - fit['margin'], 4)}
            else:
                anchor[tag] = {'at': round((lo + hi) / 2 / SIZE[tag][0], 4), 'to': 0.5}
        sets[sid] = {'plates': cfg['plates'], 'size': {k: list(v) for k, v in SIZE.items()}, 'anchor': anchor, 'people': people}
    json.dump({'sets': sets}, open(os.path.join(OUT, 'standees.json'), 'w'), ensure_ascii=False, indent=1)
    print('ok', {k: [p['id'] for p in v['people']] for k, v in sets.items()})


if __name__ == '__main__':
    main()
