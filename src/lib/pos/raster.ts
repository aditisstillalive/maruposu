/** Largest logo the 58 mm printers take (384 dots across); 80 mm prints it centred. */
export const LOGO_MAX_WIDTH = 384;
export const LOGO_MAX_HEIGHT = 240;

/**
 * RGBA pixels → 1-bit raster for ESC/POS (1 = black dot), rows padded to whole
 * bytes. Transparent pixels count as paper; anything darker than `threshold`
 * (luminance over white, 0–255) is printed.
 */
export function toRaster(data: Uint8ClampedArray, width: number, height: number, threshold = 160): { width: number; height: number; bits: Uint8Array } {
  const rowBytes = Math.ceil(width / 8);
  const bits = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * a + 255 * (1 - a);
      if (lum < threshold) bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width: rowBytes * 8, height, bits };
}
