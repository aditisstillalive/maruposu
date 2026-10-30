import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { DEVICE_COOKIE, verifyDeviceToken } from '@/lib/device-session';

// Defense in depth: reject requests without a session before they reach route code.
// Admin routes still check the AdminUser table (requireAdminApi); POS pages still check
// the device's PIN version against the DB (requireDevice).
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/admin') || pathname.startsWith('/api/upload')) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.next();
  }

  const secret = process.env.DEVICE_SESSION_SECRET ?? '';
  const device = await verifyDeviceToken(request.cookies.get(DEVICE_COOKIE)?.value, secret);
  if (!device) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Device locked' }, { status: 401 });
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*', '/api/upload/:path*', '/api/pos/:path*', '/pos/:path*'],
};
