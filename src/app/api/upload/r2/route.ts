import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { getPresignedUploadUrl, generateKey } from '@/lib/r2';

// No SVG: it can carry scripts. The key's extension comes from the validated type,
// not the client's filename.
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const ALLOWED_PREFIXES = ['products', 'employees'];
const MAX_SIZE = 10 * 1024 * 1024;

// Returns a presigned PUT URL; the browser uploads the file directly to R2.
export async function POST(request: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  try {
    const { filename, contentType, size, prefix } = await request.json();

    if (typeof filename !== 'string' || !filename) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (typeof contentType !== 'string' || !Object.hasOwn(EXTENSIONS, contentType)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    if (typeof size !== 'number' || size <= 0 || size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    if (!ALLOWED_PREFIXES.includes(prefix)) {
      return NextResponse.json({ error: 'Invalid upload prefix' }, { status: 400 });
    }

    const key = generateKey(prefix, `upload.${EXTENSIONS[contentType]}`);
    const { uploadUrl, publicUrl } = await getPresignedUploadUrl(key, contentType, size);

    return NextResponse.json({ uploadUrl, url: publicUrl, key });
  } catch (error) {
    console.error('R2 presign error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
