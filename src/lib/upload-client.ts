// Browser-side: get a presigned URL from our API, then PUT the file straight to R2.
// Returns the public R2 URL to store in the database.
export async function uploadImageToR2(
  file: File,
  prefix: 'products' | 'employees'
): Promise<string> {
  const presign = await fetch('/api/upload/r2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, prefix }),
  });

  if (!presign.ok) {
    const error = await presign.json().catch(() => ({}));
    throw new Error(error.error || 'Upload failed');
  }

  const { uploadUrl, url } = await presign.json();

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!put.ok) {
    throw new Error(`Upload to storage failed (${put.status})`);
  }

  return url;
}

/**
 * Shrinks a photo before upload: longest side at most `maxSide` px, re-encoded as
 * JPEG. Phone photos (3–8MB) come out around 150–400KB. Honours EXIF rotation.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.72): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not compress image'))), 'image/jpeg', quality)
  );
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
