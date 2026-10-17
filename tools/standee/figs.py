# full-body standee silhouettes v2 (designer review v1 of the mock): built from a 2D skeleton instead of fixed outlines, so each
# figure has a weight leg and a relaxed leg, shoulder and pelvis lines tilted against each other, bent elbows with a gap at the
# waist, hands, shoes with a toe, a jacket hem wider than the waist, a trouser break, a narrowing neck, ears and an uneven hairline.
# Units: metres, x to screen right of the feet centre, y up from the floor. Parts are closed outlines (Catmull-Rom through the
# points) drawn into one mask; a part named 'forearm' is also kept apart for the J3-style lit line on top of cuffed forearms.
import math

def V(a, b): return (b[0] - a[0], b[1] - a[1])
def L(v): return math.hypot(*v)
def N(v): l = L(v) or 1.0; return (v[0] / l, v[1] / l)
def P(v): return (-v[1], v[0])                       # perpendicular (left of travel)
def A(p, v, k=1.0): return (p[0] + v[0] * k, p[1] + v[1] * k)
def lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
def flip(pts): return [(-x, y) for x, y in pts]
def mv(pts, dx=0.0, dy=0.0): return [(x + dx, y + dy) for x, y in pts]

def disc(c, r, n=10): return [(c[0] + r * math.cos(2 * math.pi * i / n), c[1] + r * math.sin(2 * math.pi * i / n)) for i in range(n)]

def seg(a, b, wa, wb, bulge=0.0, at=0.4, lean=0.0):
    """tapered limb a->b (full widths wa, wb), a muscle bulge of `bulge` m at fraction `at`; lean>0 puts more of the bulge on the
    left of travel (calf behind the shin, biceps in front)"""
    d = N(V(a, b)); n = P(d); m = lerp(a, b, at); wm = (wa + (wb - wa) * at) + bulge
    l1, r1 = wm / 2 * (1 + lean), wm / 2 * (1 - lean)
    return [A(a, n, wa / 2), A(m, n, l1), A(b, n, wb / 2), A(b, d, wb * 0.12), A(b, n, -wb / 2), A(m, n, -r1), A(a, n, -wa / 2), A(a, d, -wa * 0.12)]

def place(tmpl, origin, d):
    """template (u along d, v to the left of d) -> world"""
    d = N(d); n = P(d); return [(origin[0] + d[0] * u + n[0] * v, origin[1] + d[1] * u + n[1] * v) for u, v in tmpl]

# relaxed hanging hand seen edge-on (front/back view): wrist, palm, the thumb's bump on the body side, curled fingers
def hand(side, scale=1.0):   # side: +1 thumb to the left of travel, -1 to the right
    s = side
    t = [(0.0, 0.022), (0.035, 0.026), (0.08, 0.026), (0.125, 0.021), (0.165, 0.013), (0.186, 0.003), (0.182, -0.01), (0.15, -0.017),
         (0.112, -0.021), (0.098, -0.024), (0.088, -0.038), (0.07, -0.046), (0.05, -0.04), (0.025, -0.027), (0.0, -0.022)]   # thumb on -v
    return [(u * scale, -v * s * scale) for u, v in t]

def shoe_front(cx, out=0.0, w=0.10, toe=0.03):
    """shoe seen from the front: instep up to the trouser, a wider rounded toe cap, flat sole. out>0 turns the toe outward (+x)"""
    h = w / 2
    return [(cx - h * 0.62, 0.075), (cx + h * 0.62, 0.075), (cx + h * 0.95 + out, 0.045), (cx + h + out + toe * 0.3, 0.018),
            (cx + h + out + toe * 0.25, 0.0), (cx - h + out * 0.4, 0.0), (cx - h + out * 0.3, 0.018), (cx - h * 0.95, 0.045)]

def shoe_back(cx, out=0.0, w=0.09):
    """from behind: the heel counter, and the toe peeking past it on the side the foot turns to (out = +/- toe length)"""
    h = w / 2; tx = cx + (h + abs(out)) * (1 if out >= 0 else -1)
    pts = [(cx - h * 0.7, 0.08), (cx + h * 0.7, 0.08), (cx + h, 0.03), (cx + h * 0.9, 0.0), (cx - h * 0.9, 0.0), (cx - h, 0.03)]
    toe = [(cx, 0.045), (tx - 0.01 * (1 if out >= 0 else -1), 0.035), (tx, 0.016), (tx - 0.004 * (1 if out >= 0 else -1), 0.0), (cx, 0.0)]
    return [pts, toe]

def head(c, w=0.152, h=0.232, jaw=0.82, ears=True, tilt=0.0):
    """front/back head: cranium, jaw narrowing to the chin, ear bumps"""
    hw, hh = w / 2, h / 2; pts = []
    for i in range(24):
        a = 2 * math.pi * i / 24; x, y = math.cos(a), math.sin(a)
        k = 1.0 if y >= 0 else 1 - (1 - jaw) * (-y) ** 0.8          # narrower towards the chin
        yy = y * hh if y >= 0 else y * hh * 1.0
        pts.append((x * hw * k, yy))
    out = [(c[0] + x * math.cos(tilt) - y * math.sin(tilt), c[1] + x * math.sin(tilt) + y * math.cos(tilt)) for x, y in pts]
    parts = [out]
    if ears:
        for s in (-1, 1):
            e = (c[0] + s * (hw + 0.006), c[1] - 0.005)
            parts.append([(e[0] - s * 0.012, e[1] + 0.03), (e[0] + s * 0.004, e[1] + 0.026), (e[0] + s * 0.008, e[1]), (e[0] + s * 0.002, e[1] - 0.028),
                          (e[0] - s * 0.014, e[1] - 0.032)])
    return parts

def wavy(pts, amp, n, seed=0.0):
    """uneven hair edge: push each outline point out by a small irregular amount"""
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts); out = []
    for i, (x, y) in enumerate(pts):
        r = amp * (0.6 * math.sin(i * 2.399 + seed) + 0.4 * math.sin(i * 5.17 + seed * 1.7))
        d = N((x - cx, y - cy)); out.append((x + d[0] * r, y + d[1] * r))
    return out

def neck(base_c, top_c, wb=0.13, wt=0.098, wn=0.088):
    """neck: narrowest under the jaw, flaring into the trapezius"""
    m = lerp(base_c, top_c, 0.55)
    return [(top_c[0] - wt / 2, top_c[1]), (top_c[0] + wt / 2, top_c[1]), (m[0] + wn / 2, m[1]), (base_c[0] + wb / 2, base_c[1]),
            (base_c[0] - wb / 2, base_c[1]), (m[0] - wn / 2, m[1])]

# ---------------------------------------------------------------- skeleton -> figure
def figure(sk, kind):
    """sk: joints and options. kind: 'suit' | 'casual' | 'uniform' | 'coat'"""
    parts = []
    sl, sr = sk['shoulder_l'], sk['shoulder_r']; hl, hr = sk['hip_l'], sk['hip_r']; nb = sk['neck_base']
    # torso: padded square shoulders (rounded corner), waist, hips; jacket hem flares wider than the waist
    pad = 0.035 if kind in ('suit', 'uniform') else 0.025
    wl, wr = sk['waist_l'], sk['waist_r']
    hem = sk.get('hem')                                                # jacket / coat hem y and half-width (relative to pelvis)
    tor = [(nb[0] - 0.06, nb[1] + 0.005), (lerp(nb, sl, 0.55)[0], lerp(nb, sl, 0.55)[1] + (0.012 if kind != 'suit' else 0.008)),
           (sl[0] + 0.004, sl[1] + 0.014), (sl[0] - pad * 0.55, sl[1] + 0.007), (sl[0] - pad * 0.95, sl[1] - 0.012), (sl[0] - pad, sl[1] - 0.04),
           (sl[0] - pad + 0.004, sl[1] - 0.08), (wl[0], wl[1] + 0.10), wl]
    if hem:
        hy, hw_l, hw_r = hem
        hl_, hr_ = (sk['pelvis'][0] - hw_l, hy + 0.012), (sk['pelvis'][0] + hw_r, hy + 0.012)
        if sk.get('hem_line'):   # the side runs straight from the waist to the hem corner (no point pulled in at the hip joint)
            tor += [lerp(wl, hl_, 0.5), hl_, (sk['pelvis'][0] - hw_l * 0.5, hy - 0.004), (sk['pelvis'][0] + hw_r * 0.5, hy - 0.004), hr_, lerp(sk['waist_r'], hr_, 0.5)]
        else:
            tor += [(hl[0] - 0.02, hl[1] + 0.02), hl_, (sk['pelvis'][0] - hw_l * 0.5, hy - 0.004),
                    (sk['pelvis'][0] + hw_r * 0.5, hy - 0.004), hr_, (hr[0] + 0.02, hr[1] + 0.02)]
    else:
        tor += [(hl[0] - 0.01, hl[1]), (sk['pelvis'][0], sk['pelvis'][1] - 0.11), (hr[0] + 0.01, hr[1])]
    tor += [wr, (wr[0], wr[1] + 0.10), (sr[0] + pad - 0.004, sr[1] - 0.08), (sr[0] + pad, sr[1] - 0.04), (sr[0] + pad * 0.95, sr[1] - 0.012),
            (sr[0] + pad * 0.55, sr[1] + 0.007), (sr[0] - 0.004, sr[1] + 0.014),
            (lerp(nb, sr, 0.55)[0], lerp(nb, sr, 0.55)[1] + (0.012 if kind != 'suit' else 0.008)), (nb[0] + 0.06, nb[1] + 0.005)]
    parts.append(('torso', tor))
    if kind == 'uniform':   # epaulettes and the duty belt's pouches (review v1: keep)
        for s, sh in ((-1, sl), (1, sr)):
            parts.append(('acc', [(sh[0] - s * 0.078, sh[1] + 0.028), (sh[0] - s * 0.002, sh[1] + 0.012), (sh[0] + s * 0.006, sh[1] + 0.02),
                                  (sh[0] - s * 0.075, sh[1] + 0.037)]))
        for s, w in ((-1, wl), (1, wr)):
            b = (w[0] + s * 0.018, w[1] - 0.085)
            parts.append(('acc', [(b[0] - s * 0.03, b[1] + 0.03), (b[0] + s * 0.012, b[1] + 0.03), (b[0] + s * 0.016, b[1] - 0.04), (b[0] - s * 0.03, b[1] - 0.045)]))
    # legs: trousers hip->knee->hem with a break over the shoe
    tw = sk.get('trouser', (0.175, 0.125, 0.105))
    for side in ('l', 'r'):
        H, K, An = sk['hip_' + side], sk['knee_' + side], sk['ankle_' + side]
        if kind == 'coat':   # tights under a knee-length coat: the thigh is under the coat, the calf shows
            parts.append(('leg', seg(H, K, 0.13, 0.085)))
            parts.append(('leg', seg(K, An, 0.085, 0.052, bulge=0.012, at=0.3)))
            parts.append(('leg', disc(K, 0.042)))
        else:
            parts.append(('leg', seg(H, K, tw[0], tw[1], bulge=0.008, at=0.3)))
            parts.append(('leg', disc(K, tw[1] / 2)))
            hemc = (An[0], 0.035)
            parts.append(('leg', seg(K, hemc, tw[1], tw[2], bulge=0.004, at=0.5)))
            # break: the cloth stacks a little over the shoe, wider for 3 cm
            parts.append(('leg', [(hemc[0] - tw[2] / 2, 0.1), (hemc[0] + tw[2] / 2, 0.1), (hemc[0] + tw[2] / 2 + 0.004, 0.06),
                                  (hemc[0] + tw[2] / 2 + 0.002, 0.035), (hemc[0] - tw[2] / 2 - 0.002, 0.035), (hemc[0] - tw[2] / 2 - 0.004, 0.06)]))
    for s in sk['shoes']: parts.append(('shoe', s))
    # arms: shoulder -> elbow (slightly bent) -> wrist -> hand
    aw = sk.get('arm', (0.105, 0.088, 0.072))
    for side, sgn in (('l', -1), ('r', 1)):
        S, E, W = sk['sj_' + side], sk['elbow_' + side], sk['wrist_' + side]
        name = 'forearm' if sk.get('cuffed') else 'arm'
        parts.append(('arm', seg(S, E, aw[0], aw[1], bulge=0.01, at=0.35)))
        parts.append(('arm', disc(E, aw[1] / 2)))
        parts.append((name, seg(E, W, aw[1], aw[2], bulge=0.008, at=0.3)))
        hd = sk.get('hand_dir_' + side, V(E, W))
        parts.append((name, place(hand(sgn if not sk.get('cuffed') else -sgn, sk.get('hand_scale', 1.0)), A(W, N(hd), -0.012), hd)))
    # neck and head
    parts.append(('neck', neck(nb, sk['neck_top'], wb=sk.get('neck_w', (0.13, 0.098, 0.088))[0], wt=sk.get('neck_w', (0.13, 0.098, 0.088))[1],
                               wn=sk.get('neck_w', (0.13, 0.098, 0.088))[2])))
    for h in sk['head']: parts.append(('head', h))
    for h in sk.get('hair', []): parts.append(('hair', h))
    for x in sk.get('extra', []): parts.append(x)
    return parts

def stance(weight='l', pelvis_x=-0.025, hip_y=0.93, tilt=0.018, sh_y=1.445, sh_w=0.205, sh_tilt=0.016, knee_bend=0.06, feet=(0.10, 0.13),
           elbow=(0.225, 1.115), wrist=(0.205, 0.86), sj_in=0.03, waist=(0.148, 1.06), hip_w=0.1, neck_x=None):
    """contrapposto: the weight leg's hip is higher and the pelvis sits over that foot; the shoulder line tilts the other way;
    the free knee is bent and comes in, its foot a little out and forward"""
    w = -1 if weight == 'l' else 1
    pel = (pelvis_x if weight == 'l' else -pelvis_x, hip_y)   # pelvis over the weight foot
    hl = (pel[0] - hip_w, hip_y + (tilt if weight == 'l' else -tilt)); hr = (pel[0] + hip_w, hip_y + (tilt if weight == 'r' else -tilt))
    fl, fr = -feet[0], feet[1]
    if weight == 'l': fl = pel[0] - 0.035
    else: fr = pel[0] + 0.035
    al, ar = (fl, 0.085), (fr, 0.085)
    kl = lerp(hl, al, 0.5); kr = lerp(hr, ar, 0.5)
    if weight == 'l': kr = (kr[0] - knee_bend * 0.4, kr[1] - knee_bend * 0.5)
    else: kl = (kl[0] + knee_bend * 0.4, kl[1] - knee_bend * 0.5)
    shl = (-sh_w, sh_y + (-sh_tilt if weight == 'l' else sh_tilt)); shr = (sh_w, sh_y + (sh_tilt if weight == 'l' else -sh_tilt))
    nx = neck_x if neck_x is not None else pel[0] * 0.3
    sk = dict(pelvis=pel, hip_l=hl, hip_r=hr, knee_l=kl, knee_r=kr, ankle_l=al, ankle_r=ar, shoulder_l=shl, shoulder_r=shr,
              neck_base=(nx, sh_y + 0.055), neck_top=(nx + 0.004, sh_y + 0.17),
              sj_l=(shl[0] + sj_in, shl[1] - 0.025), sj_r=(shr[0] - sj_in, shr[1] - 0.025),
              elbow_l=(-elbow[0] + pel[0] * 0.3, elbow[1] + (shl[1] - sh_y)), elbow_r=(elbow[0] + pel[0] * 0.3, elbow[1] + (shr[1] - sh_y)),
              wrist_l=(-wrist[0] + pel[0] * 0.5, wrist[1] + (shl[1] - sh_y)), wrist_r=(wrist[0] + pel[0] * 0.5, wrist[1] + (shr[1] - sh_y)),
              waist_l=(-waist[0] + pel[0] * 0.6, waist[1]), waist_r=(waist[0] + pel[0] * 0.6, waist[1]))
    return sk

# ---------------------------------------------------------------- characters
def lucas_back():
    # weight on his right leg = screen right from behind; jacket hem flares; hair: thick from behind, layered nape
    sk = stance(weight='r', pelvis_x=-0.028, tilt=0.016, sh_y=1.452, sh_w=0.2, sh_tilt=0.014, feet=(0.105, 0.10),
                elbow=(0.207, 1.11), wrist=(0.19, 0.865), waist=(0.158, 1.07))
    sk['hem'] = (0.775, 0.178, 0.172); sk['trouser'] = (0.18, 0.13, 0.112); sk['arm'] = (0.112, 0.095, 0.082)
    al, ar = sk['ankle_l'], sk['ankle_r']
    sk['shoes'] = shoe_back(al[0], out=-0.035) + shoe_back(ar[0], out=0.03)
    hc = (sk['neck_top'][0] - 0.004, 1.672)
    sk['head'] = head(hc, w=0.150, h=0.226, ears=True)
    hair = [(hc[0] - 0.086, 1.615), (hc[0] - 0.093, 1.66), (hc[0] - 0.094, 1.705), (hc[0] - 0.087, 1.745), (hc[0] - 0.068, 1.775),
            (hc[0] - 0.04, 1.793), (hc[0] - 0.008, 1.80), (hc[0] + 0.03, 1.797), (hc[0] + 0.062, 1.782), (hc[0] + 0.085, 1.752),
            (hc[0] + 0.095, 1.71), (hc[0] + 0.094, 1.66), (hc[0] + 0.086, 1.615),
            (hc[0] + 0.07, 1.585), (hc[0] + 0.058, 1.572), (hc[0] + 0.045, 1.578), (hc[0] + 0.03, 1.566), (hc[0] + 0.012, 1.574),
            (hc[0] - 0.006, 1.562), (hc[0] - 0.024, 1.573), (hc[0] - 0.04, 1.566), (hc[0] - 0.056, 1.578), (hc[0] - 0.072, 1.588)]
    sk['hair'] = [wavy(hair[:13], 0.0035, 13, 1.3) + hair[13:]]
    sk['hand_scale'] = 1.0
    return figure(sk, 'suit')

def lucas_front():
    sk = stance(weight='l', pelvis_x=-0.026, sh_y=1.452, sh_w=0.2, feet=(0.10, 0.105), elbow=(0.207, 1.11), wrist=(0.19, 0.865), waist=(0.158, 1.07))
    sk['hem'] = (0.775, 0.172, 0.178); sk['trouser'] = (0.18, 0.13, 0.112); sk['arm'] = (0.112, 0.095, 0.082)
    sk['shoes'] = [shoe_front(sk['ankle_l'][0], out=-0.02), shoe_front(sk['ankle_r'][0], out=0.025)]
    hc = (sk['neck_top'][0], 1.672); sk['head'] = head(hc, w=0.150, h=0.226)
    # centre-parted curtain fringe: volume on top, the curtains end at the brow and flick past the temples
    fr = [(hc[0] - 0.081, 1.66), (hc[0] - 0.092, 1.648), (hc[0] - 0.095, 1.70), (hc[0] - 0.086, 1.748), (hc[0] - 0.06, 1.783), (hc[0] - 0.025, 1.797),
          (hc[0], 1.792), (hc[0] + 0.025, 1.798), (hc[0] + 0.06, 1.784), (hc[0] + 0.086, 1.748), (hc[0] + 0.095, 1.70), (hc[0] + 0.092, 1.648),
          (hc[0] + 0.081, 1.66), (hc[0] + 0.07, 1.70), (hc[0], 1.72), (hc[0] - 0.07, 1.70)]
    sk['hair'] = [wavy(fr, 0.003, len(fr), 0.7)]
    return figure(sk, 'suit')

def ethan_cuffed():
    # holding door, facing the camera: hands cuffed in front at the waist (ep1: 手銬扣在他身前), shoulders a little hunched (cast 'hunch')
    sk = stance(weight='r', pelvis_x=-0.02, tilt=0.014, sh_y=1.44, sh_w=0.192, sh_tilt=0.012, feet=(0.10, 0.10), waist=(0.15, 1.06))
    sk['trouser'] = (0.17, 0.12, 0.10); sk['arm'] = (0.098, 0.084, 0.066)
    # elbows out a little, forearms angled in to the wrists together in front of the belt
    sk['elbow_l'] = (-0.196, 1.085); sk['elbow_r'] = (0.19, 1.078)
    sk['wrist_l'] = (-0.04, 0.905); sk['wrist_r'] = (0.034, 0.9)
    sk['hand_dir_l'] = (0.25, -1.0); sk['hand_dir_r'] = (-0.25, -1.0); sk['cuffed'] = True; sk['hand_scale'] = 0.92
    sk['shoes'] = [shoe_front(sk['ankle_l'][0], out=-0.025), shoe_front(sk['ankle_r'][0], out=0.02)]
    sk['neck_base'] = (sk['neck_base'][0], sk['neck_base'][1] + 0.012); sk['neck_top'] = (sk['neck_top'][0], 1.585)
    hc = (sk['neck_top'][0] - 0.006, 1.655); sk['head'] = head(hc, w=0.150, h=0.228)   # head lowered (hunch)
    m = [(hc[0] - 0.084, 1.63), (hc[0] - 0.095, 1.675), (hc[0] - 0.092, 1.72), (hc[0] - 0.08, 1.755), (hc[0] - 0.058, 1.776), (hc[0] - 0.035, 1.774),
         (hc[0] - 0.018, 1.788), (hc[0] + 0.004, 1.782), (hc[0] + 0.026, 1.79), (hc[0] + 0.05, 1.779), (hc[0] + 0.072, 1.765), (hc[0] + 0.088, 1.735),
         (hc[0] + 0.097, 1.692), (hc[0] + 0.09, 1.632), (hc[0] + 0.074, 1.672), (hc[0], 1.694), (hc[0] - 0.072, 1.672)]
    sk['hair'] = [wavy(m, 0.006, len(m), 2.1)]     # messy, a little curly: an uneven crown, tufts over the ears
    return figure(sk, 'casual')

def ethan_lookback():
    # S6: halfway down the steps, body facing down (the camera), head turned back up to Lucas. Lucas stands up and to the screen
    # RIGHT of him (world +x = Ethan's own left), so the profile faces screen right and tips up ~12 deg
    sk = stance(weight='l', pelvis_x=-0.022, tilt=0.014, sh_y=1.44, sh_w=0.192, sh_tilt=0.012, feet=(0.10, 0.10), waist=(0.15, 1.06),
                elbow=(0.2, 1.11), wrist=(0.186, 0.865))
    sk['trouser'] = (0.17, 0.12, 0.10); sk['arm'] = (0.098, 0.084, 0.066)
    sk['shoes'] = [shoe_front(sk['ankle_l'][0], out=-0.022), shoe_front(sk['ankle_r'][0], out=0.022)]
    # turning back: the upper body twists ~40 deg towards Lucas (screen right), so the shoulders read narrower and the far
    # (screen-left) arm swings half behind the torso; the near arm hangs a little back. Hunched more than at the door.
    sk['shoulder_l'] = (-0.15, sk['shoulder_l'][1] - 0.012); sk['shoulder_r'] = (0.168, sk['shoulder_r'][1] + 0.006)
    sk['sj_l'] = (-0.128, sk['shoulder_l'][1] - 0.03); sk['sj_r'] = (0.14, sk['shoulder_r'][1] - 0.03)
    # designer review v2: the far (screen-left) hand goes fully behind the body, the near hand hangs straight like Lucas's (it
    # angled forward and read as holding something), and the hem runs on over the hip in one line (the hip read as a holster)
    sk['elbow_l'] = (-0.09, 1.12); sk['wrist_l'] = (-0.052, 0.92); sk['hand_dir_l'] = (0.15, -1.0)
    sk['elbow_r'] = (0.186, 1.11); sk['wrist_r'] = (0.176, 0.865); sk['hand_dir_r'] = (-0.03, -1.0)
    sk['waist_l'] = (-0.15, 1.06); sk['waist_r'] = (0.145, 1.06); sk['hem_line'] = True
    pel = sk['pelvis']; sk['hip_l'] = (pel[0] - 0.068, sk['hip_l'][1]); sk['hip_r'] = (pel[0] + 0.078, sk['hip_r'][1])   # pelvis turns less than the chest
    sk['knee_l'] = lerp(sk['hip_l'], sk['ankle_l'], 0.5); sk['trouser'] = (0.148, 0.116, 0.10)
    sk['hem'] = (0.835, 0.142, 0.15)    # jacket hem from the waist line straight over the hips (no step at the hip joint)
    sk['neck_base'] = (sk['neck_base'][0] + 0.01, sk['neck_base'][1] + 0.012)
    sk['neck_top'] = (sk['neck_top'][0] + 0.022, 1.588)
    hc = (sk['neck_top'][0] + 0.004, 1.66); t = math.radians(12)
    # profile: back of the skull on the left, brow, nose, lips, chin on the right; rotated up by t about the neck
    prof = [(-0.098, 0.0), (-0.1, 0.045), (-0.085, 0.09), (-0.05, 0.118), (0.0, 0.122), (0.045, 0.105), (0.075, 0.07), (0.088, 0.035), (0.086, 0.01),
            (0.094, -0.012), (0.106, -0.04), (0.094, -0.047), (0.092, -0.06), (0.097, -0.072), (0.088, -0.082), (0.084, -0.095), (0.06, -0.112),
            (0.025, -0.112), (0.0, -0.09), (-0.03, -0.075), (-0.07, -0.06), (-0.092, -0.035)]
    rot = lambda p: (hc[0] + p[0] * math.cos(t) - p[1] * math.sin(t), hc[1] + p[0] * math.sin(t) + p[1] * math.cos(t))
    sk['head'] = [[rot(p) for p in prof]]
    hair = [(-0.104, -0.01), (-0.11, 0.04), (-0.098, 0.088), (-0.075, 0.118), (-0.048, 0.132), (-0.02, 0.128), (0.005, 0.138), (0.03, 0.126),
            (0.055, 0.115), (0.072, 0.092), (0.066, 0.075), (0.04, 0.09), (0.0, 0.085), (-0.04, 0.06), (-0.06, 0.0), (-0.078, -0.05)]
    sk['hair'] = [[rot(p) for p in wavy(hair, 0.004, len(hair), 0.4)]]
    return figure(sk, 'casual')

def bailiff():
    # crew cut (review v1 §2): flat top, rounded corners, sides narrowing; shoulders wide, epaulettes, duty belt pouches
    sk = stance(weight='l', pelvis_x=-0.02, tilt=0.012, sh_y=1.465, sh_w=0.226, sh_tilt=0.01, feet=(0.11, 0.115), elbow=(0.226, 1.12),
                wrist=(0.212, 0.872), waist=(0.172, 1.07), hip_w=0.108)
    sk['trouser'] = (0.19, 0.135, 0.112); sk['arm'] = (0.118, 0.098, 0.078)
    sk['shoes'] = [shoe_front(sk['ankle_l'][0], out=-0.02, w=0.105), shoe_front(sk['ankle_r'][0], out=0.025, w=0.105)]
    sk['neck_w'] = (0.15, 0.115, 0.108)
    hc = (sk['neck_top'][0], 1.69); sk['head'] = head(hc, w=0.158, h=0.236, jaw=0.86)
    c = [(hc[0] - 0.074, 1.66), (hc[0] - 0.081, 1.715), (hc[0] - 0.079, 1.765), (hc[0] - 0.066, 1.797), (hc[0] - 0.04, 1.81), (hc[0] + 0.04, 1.81),
         (hc[0] + 0.066, 1.797), (hc[0] + 0.079, 1.765), (hc[0] + 0.081, 1.715), (hc[0] + 0.074, 1.66), (hc[0], 1.70)]
    sk['hair'] = [c]
    return figure(sk, 'uniform')

def sister():
    # back view, 1.68 m (scaled at draw time): long straight hair past the shoulders, knee-length coat, shoulder bag at her right hip
    sk = stance(weight='r', pelvis_x=-0.02, hip_y=0.90, tilt=0.016, sh_y=1.40, sh_w=0.178, sh_tilt=0.012, feet=(0.08, 0.085),
                elbow=(0.172, 1.07), wrist=(0.162, 0.83), waist=(0.128, 1.03), hip_w=0.09)
    sk['hem'] = (0.56, 0.20, 0.205); sk['arm'] = (0.095, 0.08, 0.062); sk['hand_scale'] = 0.88
    sk['shoes'] = shoe_back(sk['ankle_l'][0], out=-0.028, w=0.075) + shoe_back(sk['ankle_r'][0], out=0.03, w=0.075)
    sk['neck_w'] = (0.11, 0.085, 0.075)
    hc = (sk['neck_top'][0], 1.615); sk['head'] = head(hc, w=0.142, h=0.215)
    hr = [(0, 1.735), (0.05, 1.725), (0.08, 1.69), (0.09, 1.63), (0.092, 1.56), (0.098, 1.49), (0.106, 1.42), (0.098, 1.398), (0.078, 1.406),
          (0.052, 1.394), (0.022, 1.40), (0, 1.396)]
    hair = hr + [(-x, y) for x, y in reversed(hr[1:-1])]
    sk['hair'] = [mv(wavy(hair, 0.002, len(hair), 0.9), hc[0])]
    # the bag hangs at her LEFT hip (screen left from behind): on the right it pushed her outline 1.5 cm past the arm, and the
    # S6 phone crop needs every figure 12 % of the crop width from the edges (review v1 §4)
    wl = sk['waist_l']
    bag = [(wl[0] + 0.02, 0.985), (wl[0] + 0.14, 0.99), (wl[0] + 0.155, 0.94), (wl[0] + 0.152, 0.81), (wl[0] + 0.136, 0.79), (wl[0] + 0.024, 0.79)]
    sk['extra'] = [('acc', [(2 * wl[0] - x + 0.0, y) for x, y in bag]), ('acc', [(-0.11, 1.385), (-0.14, 1.385), (wl[0] - 0.1, 0.99), (wl[0] - 0.083, 0.99)])]
    return figure(sk, 'coat')

FIG = {'lucas_back': lucas_back(), 'lucas_front': lucas_front(), 'ethan_cuffed': ethan_cuffed(), 'ethan_lookback': ethan_lookback(),
       'bailiff': bailiff(), 'sister': sister()}

def top_of(parts): return max(y for _, pts in parts for _, y in pts)
