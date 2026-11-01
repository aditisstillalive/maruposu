import { describe, expect, it } from 'vitest';
import { toRaster } from './raster';

/** RGBA pixels from rows of 'x' (black), '.' (white) and ' ' (transparent). */
function rgba(rows: string[]) {
  const w = rows[0].length;
  const data = new Uint8ClampedArray(w * rows.length * 4);
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    const i = (y * w + x) * 4;
    const v = c === 'x' ? 0 : 255;
    data.set([v, v, v, c === ' ' ? 0 : 255], i);
  }));
  return { data, width: w, height: rows.length };
}

describe('toRaster', () => {
  it('packs dark pixels as 1 bits, 8 per byte, left to right', () => {
    const img = rgba(['xxxx....xxxx....', '................']);
    const r = toRaster(img.data, img.width, img.height);
    expect(r).toMatchObject({ width: 16, height: 2 });
    expect([...r.bits]).toEqual([0xf0, 0xf0, 0x00, 0x00]);
  });

  it('treats transparent pixels as paper and pads rows to whole bytes', () => {
    const img = rgba(['x x x x x ', 'xxxxxxxxxx']);
    const r = toRaster(img.data, img.width, img.height);
    expect(r.width).toBe(16); // 10 px padded to 2 bytes
    expect([...r.bits]).toEqual([0xaa, 0x80, 0xff, 0xc0]);
  });
});
