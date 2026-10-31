'use client';

import Image from 'next/image';

/**
 * An uploaded photo (R2) filling its box, resized by next/image to the few
 * widths in next.config. `sizes` is the box's displayed width, so a tablet
 * downloads a small variant instead of the original upload.
 */
export default function R2Photo({ src, sizes, className = '', onError }: { src: string; sizes: string; className?: string; onError?: () => void }) {
  return <Image src={src} alt="" fill sizes={sizes} className={`object-cover ${className}`} onError={onError} />;
}
