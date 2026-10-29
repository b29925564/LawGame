import { inflateSync } from 'node:zlib';

/** 8 位元、非交錯 PNG → 最亮的那個色版值（略過上下各兩列：鏡頭條的邊線）。 */
export function brightest(png: Buffer) {
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const ch = png[25] === 6 ? 4 : 3;
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const len = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT')
      idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    const up = y ? rows[y - 1] : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0;
      const b = up[x];
      const c = x >= ch ? up[x - ch] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      line[x] = (line[x] + [0, a, b, (a + b) >> 1, paeth][f]) & 255;
    }
    rows.push(line);
  }
  let max = 0;
  for (let y = 2; y < h - 2; y++)
    for (let x = 0; x < stride; x++) if (x % ch !== 3) max = Math.max(max, rows[y][x]);
  return max;
}
