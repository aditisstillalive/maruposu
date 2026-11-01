'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { LOGO_MAX_HEIGHT, LOGO_MAX_WIDTH, toRaster } from '@/lib/pos/raster';
import type { ReceiptLogo } from '@/lib/pos/types';

type Source = { data: Uint8ClampedArray; width: number; height: number };

/** Scales the picture to fit the paper (≤ 384×240 dots) and reads its pixels. */
async function readImage(file: File): Promise<Source> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('File bukan gambar'));
      i.src = url;
    });
    const scale = Math.min(1, LOGO_MAX_WIDTH / img.naturalWidth, LOGO_MAX_HEIGHT / img.naturalHeight);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The 1-bit image as the printer will print it, as a PNG data URL. */
function previewOf(width: number, height: number, bits: Uint8Array): string {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const black = bits[y * (width / 8) + (x >> 3)] & (0x80 >> (x & 7));
      const i = (y * width + x) * 4;
      img.data.set(black ? [0, 0, 0, 255] : [255, 255, 255, 255], i);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function toLogo(src: Source, threshold: number): ReceiptLogo {
  const r = toRaster(src.data, src.width, src.height, threshold);
  let bin = '';
  for (const b of r.bits) bin += String.fromCharCode(b);
  return { width: r.width, height: r.height, bits: btoa(bin), preview: previewOf(r.width, r.height, r.bits) };
}

/** Logo printed at the top of the receipt, converted in the browser to the printer's black-and-white dots. */
export default function ReceiptLogoInput({ value, onChange }: { value: ReceiptLogo | null; onChange: (v: ReceiptLogo | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [threshold, setThreshold] = useState(160);
  const [error, setError] = useState('');

  useEffect(() => {
    if (source) onChange(toLogo(source, threshold));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, threshold]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      setSource(await readImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membaca gambar');
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex min-h-20 w-48 items-center justify-center rounded-lg border bg-white p-2" data-testid="logo-preview">
          {value ? <img src={value.preview} alt="Logo struk" className="max-h-24 w-auto" /> : <span className="text-xs text-muted-foreground">Belum ada logo</span>}
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => input.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm hover:bg-gray-50">
            <ImagePlus className="h-4 w-4" /> {value ? 'Ganti logo' : 'Unggah logo'}
          </button>
          {value && (
            <button type="button" onClick={() => { setSource(null); onChange(null); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm text-red-700 hover:bg-gray-50">
              <X className="h-4 w-4" /> Hapus logo
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="File logo struk" className="hidden" onChange={e => void pick(e.target.files?.[0])} />
      </div>
      {source && (
        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Ketebalan</span>
          <input type="range" min={60} max={240} step={10} value={threshold} onChange={e => setThreshold(Number(e.target.value))} aria-label="Ketebalan logo" className="w-40" />
        </label>
      )}
      <p className="text-xs text-muted-foreground">Dicetak paling atas di struk, hitam-putih seperti pratinjau ini (maks. 384×240 titik). Logo hitam di latar putih/transparan hasilnya paling tajam.</p>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
