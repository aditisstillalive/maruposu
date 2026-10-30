'use client';
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { compressImage, uploadImageToR2 } from '@/lib/upload-client';

export default function PhotoInput({
  value,
  onChange,
  prefix,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  prefix: 'products' | 'employees';
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      onChange(await uploadImageToR2(await compressImage(file, 1000, 0.8), prefix));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload gagal');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="h-5 w-5 animate-spin" />
            </span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1 text-sm">
          <button type="button" onClick={() => input.current?.click()} disabled={uploading} className="font-medium underline-offset-4 hover:underline">
            {value ? 'Ganti foto' : 'Pilih foto'}
          </button>
          {value && (
            <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" /> Hapus
            </button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => pick(e.target.files?.[0])} />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
