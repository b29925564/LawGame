"""自架字型的子集（Issue #380 S3）：只打包遊戲用得到的字，不再從 Google Fonts 載。

    python3 scripts/fonts.py [--cache 下載暫存目錄]

需要 fonttools 與 brotli（pip install 'fonttools[woff]'）；只在產生字型時用，遊戲和 CI 都不需要。
步驟：
1. 從 Google Fonts 下載完整的 TTF（只下載一次，放在 --cache）。
2. 收集用到的字：src/ 底下的 .ts .tsx .yaml .json .css（測試檔除外）加 index.html。
   src/ui/fonts/ 本身不算。規則和 src/ui/fonts/chars.test.ts 一樣；劇本或介面多了子集沒有的字，那個測試會失敗，提示重跑本腳本。
3. 用到的字＋基本拉丁、標點、全形符號是「主檔字表」（chars.txt）：畫面上的字都要在裡面（測試擋）。
   中文字型把主檔字表再切成兩份，另加一份補充檔，瀏覽器只下載畫面真的用到的那幾份：
   - 首屏（-first）：標題、片頭、冷開場實際顯示的字（first.txt，scripts/fonts-first.mjs 從建置好的遊戲收）。
     玩家打開遊戲只等這一小份（設計師 #462 審查：第一次載入不能比 Google Fonts 慢）。
   - 主檔：主檔字表裡其餘的字。
   - 補充檔（-ext）：Big5 常用字裡主檔字表沒有的字，只是保險。
   fonts.css 的順序是補充檔、主檔、首屏：同一字族後宣告的先查，首屏與補充檔有 unicode-range，主檔沒有。
4. 拉丁字型（Courier、JetBrains、Plex、Source Serif）不自己切：照原樣搬 Google 給新瀏覽器的檔
   （可變字重、latin／latin-ext 兩片，unicode-range 也照抄）。自己從靜態 TTF 切的版本字寬會差 1–2 px，
   後備字型也會變（例如「←」原本由 Noto 補、Plex 自己切會換成 Plex 的），設計師要畫面逐像素不變（#462 審查）。
5. 寫出 src/ui/fonts/fonts.css（@font-face）與 chars.txt、ext.txt（字表，測試讀）。

中文子集的內部字型名稱改成 LawGame 開頭（OFL：改過的版本不沿用原名；Noto Sans TC 的版權聲明保留了 Source 這個名字）。
拉丁字型是 Google 原檔、沒改，名稱照舊。CSS 裡的 font-family 名稱不變。授權見 OFL.txt。
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

# 中文字型自己切子集：(字族, 字重, 檔名)。
FACES = [
    ('Noto Sans TC', 400, 'noto-sans-tc-400'),
    ('Noto Sans TC', 500, 'noto-sans-tc-500'),
    ('Noto Sans TC', 700, 'noto-sans-tc-700'),
    ('Noto Serif TC', 400, 'noto-serif-tc-400'),
    ('Noto Serif TC', 700, 'noto-serif-tc-700'),
    ('Noto Serif TC', 900, 'noto-serif-tc-900'),
    ('LXGW WenKai TC', 400, 'lxgw-wenkai-tc-400'),
]

# 拉丁字型：跟原本 index.html／lang.tsx 連 Google 時同一組字重，照搬 Google 給新瀏覽器的檔。
LATIN = (
    'Courier+Prime:wght@400;700&family=JetBrains+Mono:wght@500;700'
    '&family=IBM+Plex+Sans:wght@400;500;700&family=Source+Serif+4:ital,wght@0,400;0,700;0,900;1,400'
)
LATIN_SLICES = ('latin', 'latin-ext')
CHROME = (
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/141.0.0.0 Safari/537.36'
)

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
    for fam, weight, _ in FACES:
        path = cache / f'{fam.replace(" ", "")}-{weight}.ttf'
        if path.exists():
            continue
        url = CSS2 + fam.replace(' ', '+') + f':wght@{weight}'
        # 不認得的 User-Agent 會拿到完整的 TTF（認得的瀏覽器拿到切片的 woff2）。
        req = urllib.request.Request(url, headers={'User-Agent': 'fonts.py'})
        css = urllib.request.urlopen(req).read().decode()
        src = re.search(r'src: url\(([^)]+\.ttf)\)', css)
        if not src:
            sys.exit(f'{fam} {weight}: Google Fonts 沒給 TTF')
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
    # 不重算時間戳：同樣的輸入產生同樣的檔，重跑沒改字的話 git 看不到差異。
    font = TTFont(src, recalcTimestamp=False)
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


def ranges(chars: set) -> str:
    """unicode-range：連續的碼位併成一段。"""
    cps = sorted(ord(c) for c in chars)
    out = []
    start = prev = cps[0]
    for cp in cps[1:] + [None]:
        if cp is not None and cp == prev + 1:
            prev = cp
            continue
        out.append(f'U+{start:X}' if start == prev else f'U+{start:X}-{prev:X}')
        if cp is not None:
            start = prev = cp
    return ', '.join(out)


def latin_faces():
    """下載 Google 給新瀏覽器的拉丁字型切片（只留 latin、latin-ext），回傳 @font-face 文字。"""
    req = urllib.request.Request(CSS2 + LATIN + '&display=swap', headers={'User-Agent': CHROME})
    css = urllib.request.urlopen(req).read().decode()
    out, seen = [], {}
    for m in re.finditer(r'/\* ([\w-]+) \*/\s*@font-face \{([^}]+)\}', css):
        slice_, body = m.groups()
        if slice_ not in LATIN_SLICES:
            continue
        get = lambda k: re.search(k + r': ([^;]+);', body).group(1).strip()
        family, style, weight = get('font-family').strip("'"), get('font-style'), get('font-weight')
        url = re.search(r'url\(([^)]+)\)', body).group(1)
        if url not in seen:
            slug = family.lower().replace(' ', '-')
            name = f'{slug}-{style}-{weight}-{slice_}.woff2'
            (OUT / name).write_bytes(urllib.request.urlopen(url).read())
            seen[url] = name
        out.append(
            f"@font-face {{\n  font-family: '{family}';\n  font-style: {style};\n  font-weight: {weight};\n"
            f"  font-display: swap;\n  src: url('./{seen[url]}') format('woff2');\n"
            f"  unicode-range: {get('unicode-range')};\n}}"
        )
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=str(pathlib.Path.home() / '.cache/lawgame-fonts'))
    cache = pathlib.Path(ap.parse_args().cache)
    download(cache)

    primary = used_chars() | set(BASE)
    first_txt = (OUT / 'first.txt').read_text(encoding='utf-8').rstrip('\n')
    first = (set(first_txt) | {chr(c) for c in range(0x20, 0x7F)}) & primary
    rest = primary - first
    ext = big5_common() - primary
    for f in OUT.glob('*.woff2'):
        f.unlink()

    css = [
        '/* 由 scripts/fonts.py 產生，不要手改。自架子集（Issue #380 S3），授權見 OFL.txt。 */',
    ]
    for family, weight, stem in FACES:
        src = cache / f'{family.replace(" ", "")}-{weight}.ttf'
        face = f"  font-family: '{family}';\n  font-style: normal;\n  font-weight: {weight};\n  font-display: swap;\n"
        cut(src, ext, OUT / f'{stem}-ext.woff2', stem + ' Ext')
        css.append(
            f"@font-face {{\n{face}  src: url('./{stem}-ext.woff2') format('woff2');\n"
            f'  unicode-range: {EXT_RANGE};\n}}'
        )
        cut(src, rest, OUT / f'{stem}.woff2', stem)
        css.append(f"@font-face {{\n{face}  src: url('./{stem}.woff2') format('woff2');\n}}")
        cut(src, first, OUT / f'{stem}-first.woff2', stem + ' First')
        css.append(
            f"@font-face {{\n{face}  src: url('./{stem}-first.woff2') format('woff2');\n"
            f'  unicode-range: {ranges(first)};\n}}'
        )
    css += latin_faces()
    (OUT / 'fonts.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
    (OUT / 'chars.txt').write_text(''.join(sorted(primary)) + '\n', encoding='utf-8')
    (OUT / 'ext.txt').write_text(''.join(sorted(ext)) + '\n', encoding='utf-8')
    total = sum(f.stat().st_size for f in OUT.glob('*.woff2'))
    print(f'主檔字表 {len(primary)} 字（首屏 {len(first)}）、補充 {len(ext)} 字；woff2 共 {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
