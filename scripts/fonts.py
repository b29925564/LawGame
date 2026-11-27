"""自架字型的子集（Issue #380 S3）：只打包遊戲用得到的字，不再從 Google Fonts 載。

    python3 scripts/fonts.py [--cache 下載暫存目錄]

需要 fonttools 與 brotli（pip install 'fonttools[woff]'）；只在產生字型時用，遊戲和 CI 都不需要。
步驟：
1. 從 Google Fonts 下載完整的 TTF（只下載一次，放在 --cache）。
2. 收集用到的字：src/ 底下的 .ts .tsx .yaml .json .css（測試檔除外）加 index.html。
   src/ui/fonts/ 本身不算。規則和 src/ui/fonts/chars.test.ts 一樣；劇本或介面多了子集沒有的字，那個測試會失敗，提示重跑本腳本。
3. 每個字重切兩份 woff2：
   - 主檔：用到的字＋基本拉丁、標點、全形符號。畫面上的字都在這一份。
   - 中文字型另有補充檔（-ext）：Big5 常用字裡主檔沒有的字。之後新增的常用字在重跑本腳本前先由它補上，
     瀏覽器只在畫面真的出現這些字時才下載（fonts.css 的 unicode-range，主檔排在後面、先查）。
4. 寫出 src/ui/fonts/fonts.css（@font-face）與 chars.txt、ext.txt（兩份的字表，測試讀）。

字型內部名稱改成 LawGame 開頭：Source Serif 4（保留名 Source）和 IBM Plex Sans（保留名 Plex）是 OFL 保留字型名，
改過的版本（子集也算）不能沿用；其他字型一起改，規則一致。CSS 裡的 font-family 名稱不變。授權見 OFL.txt。
"""

import argparse
import pathlib
import re
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'src/ui/fonts'
CSS2 = 'https://fonts.googleapis.com/css2?family='

# (CSS 字族, 字重, 樣式, Google 字族, 檔名, 中文字型)
FACES = [
    ('Noto Sans TC', 400, 'normal', 'Noto Sans TC', 'noto-sans-tc-400', True),
    ('Noto Sans TC', 500, 'normal', 'Noto Sans TC', 'noto-sans-tc-500', True),
    ('Noto Sans TC', 700, 'normal', 'Noto Sans TC', 'noto-sans-tc-700', True),
    ('Noto Serif TC', 400, 'normal', 'Noto Serif TC', 'noto-serif-tc-400', True),
    ('Noto Serif TC', 700, 'normal', 'Noto Serif TC', 'noto-serif-tc-700', True),
    ('Noto Serif TC', 900, 'normal', 'Noto Serif TC', 'noto-serif-tc-900', True),
    ('LXGW WenKai TC', 400, 'normal', 'LXGW WenKai TC', 'lxgw-wenkai-tc-400', True),
    ('Courier Prime', 400, 'normal', 'Courier Prime', 'courier-prime-400', False),
    ('Courier Prime', 700, 'normal', 'Courier Prime', 'courier-prime-700', False),
    ('JetBrains Mono', 500, 'normal', 'JetBrains Mono', 'jetbrains-mono-500', False),
    ('JetBrains Mono', 700, 'normal', 'JetBrains Mono', 'jetbrains-mono-700', False),
    ('IBM Plex Sans', 400, 'normal', 'IBM Plex Sans', 'plex-sans-400', False),
    ('IBM Plex Sans', 500, 'normal', 'IBM Plex Sans', 'plex-sans-500', False),
    ('IBM Plex Sans', 700, 'normal', 'IBM Plex Sans', 'plex-sans-700', False),
    ('Source Serif 4', 400, 'normal', 'Source Serif 4', 'source-serif-400', False),
    ('Source Serif 4', 400, 'italic', 'Source Serif 4', 'source-serif-400i', False),
    ('Source Serif 4', 700, 'normal', 'Source Serif 4', 'source-serif-700', False),
    ('Source Serif 4', 900, 'normal', 'Source Serif 4', 'source-serif-900', False),
]

# 一定要有的字：基本拉丁、Latin-1、拉丁擴充 A、一般標點、貨幣、全形標點與符號（顯示時才產生的彎引號、日期格式也在裡面）。
BASE = (
    [chr(c) for c in range(0x20, 0x7F)]
    + [chr(c) for c in range(0xA0, 0x180)]
    + [chr(c) for c in range(0x2000, 0x2070)]
    + [chr(c) for c in range(0x20A0, 0x20C1)]
    + [chr(c) for c in range(0x3000, 0x3040)]
    + [chr(c) for c in range(0xFF01, 0xFF5F)]
)
# 補充檔的 unicode-range：中日韓表意文字、相容表意文字、全形。主檔在 CSS 裡排在後面，瀏覽器先查主檔。
EXT_RANGE = 'U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FF00-FFEF'


def used_chars():
    """和 src/ui/fonts/chars.test.ts 同一套規則。"""
    files = [
        p
        for p in sorted((ROOT / 'src').rglob('*'))
        if p.is_file()
        and p.suffix in ('.ts', '.tsx', '.yaml', '.json', '.css')
        and '.test.' not in p.name
        and p.name != 'test-setup.ts'
        and OUT not in p.parents
    ] + [ROOT / 'index.html']
    chars = set()
    for p in files:
        chars |= set(p.read_text(encoding='utf-8'))
    return {c for c in chars if ord(c) >= 0x20}


def big5_common():
    """Big5 常用字（A440–C67E）與符號區（A140–A3BF）。"""
    out = set()
    for hi in range(0xA1, 0xC7):
        for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            try:
                out.add(bytes([hi, lo]).decode('big5'))
            except UnicodeDecodeError:
                pass
    return out


def download(cache: pathlib.Path):
    cache.mkdir(parents=True, exist_ok=True)
    families = sorted({(f[3], f[1], f[2]) for f in FACES})
    for fam, weight, style in families:
        path = cache / f'{fam.replace(" ", "")}-{weight}{"i" if style == "italic" else ""}.ttf'
        if path.exists():
            continue
        axis = f'ital,wght@1,{weight}' if style == 'italic' else f'wght@{weight}'
        url = CSS2 + fam.replace(' ', '+') + ':' + axis
        # 不認得的 User-Agent 會拿到完整的 TTF（認得的瀏覽器拿到切片的 woff2）。
        req = urllib.request.Request(url, headers={'User-Agent': 'fonts.py'})
        css = urllib.request.urlopen(req).read().decode()
        src = re.search(r'src: url\(([^)]+\.ttf)\)', css)
        if not src:
            sys.exit(f'{fam} {weight} {style}: Google Fonts 沒給 TTF')
        path.write_bytes(urllib.request.urlopen(src.group(1)).read())
        print('下載', path.name)


def rename(font: TTFont, stem: str):
    family = 'LawGame ' + stem
    name = font['name']
    for rec in list(name.names):
        if rec.nameID in (1, 3, 4, 16, 21):
            name.setName(family, rec.nameID, rec.platformID, rec.platEncID, rec.langID)
        elif rec.nameID == 6:
            name.setName(family.replace(' ', '-'), 6, rec.platformID, rec.platEncID, rec.langID)
        elif rec.nameID in (17, 22):
            name.removeNames(nameID=rec.nameID)
    name.setName('This Font Software is licensed under the SIL Open Font License, Version 1.1.', 13, 3, 1, 0x409)
    name.setName('https://openfontlicense.org', 14, 3, 1, 0x409)


def cut(src: pathlib.Path, chars: set, out: pathlib.Path, stem: str):
    font = TTFont(src)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)
    rename(font, stem)
    font.flavor = 'woff2'
    font.save(out)
    return set(chr(c) for c in font.getBestCmap())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=str(pathlib.Path.home() / '.cache/lawgame-fonts'))
    cache = pathlib.Path(ap.parse_args().cache)
    download(cache)

    primary = used_chars() | set(BASE)
    ext = big5_common() - primary
    for f in OUT.glob('*.woff2'):
        f.unlink()

    css = [
        '/* 由 scripts/fonts.py 產生，不要手改。自架子集（Issue #380 S3），授權見 OFL.txt。 */',
    ]
    for family, weight, style, gfam, stem, cjk in FACES:
        src = cache / f'{gfam.replace(" ", "")}-{weight}{"i" if style == "italic" else ""}.ttf'
        face = f"  font-family: '{family}';\n  font-style: {style};\n  font-weight: {weight};\n  font-display: swap;\n"
        if cjk:
            cut(src, ext, OUT / f'{stem}-ext.woff2', stem + ' Ext')
            css.append(
                f"@font-face {{\n{face}  src: url('./{stem}-ext.woff2') format('woff2');\n"
                f'  unicode-range: {EXT_RANGE};\n}}'
            )
        cut(src, primary, OUT / f'{stem}.woff2', stem)
        css.append(f"@font-face {{\n{face}  src: url('./{stem}.woff2') format('woff2');\n}}")
    (OUT / 'fonts.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
    (OUT / 'chars.txt').write_text(''.join(sorted(primary)) + '\n', encoding='utf-8')
    (OUT / 'ext.txt').write_text(''.join(sorted(ext)) + '\n', encoding='utf-8')
    total = sum(f.stat().st_size for f in OUT.glob('*.woff2'))
    print(f'主檔 {len(primary)} 字、補充 {len(ext)} 字；woff2 共 {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
