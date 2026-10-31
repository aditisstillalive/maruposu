import { NextRequest, NextResponse } from 'next/server';
import { readDeviceToken } from '@/lib/device';
import { getCurrentOutlet } from '@/lib/outlet';
import { dataVersion } from '@/lib/data-cache';
import { businessDateWIB } from '@/lib/pos/codes';
import { buildSnapshot } from '@/lib/pos/snapshot';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

/**
 * The tablet polls this. When nothing was written since the version it already
 * has (?v=), the answer is "unchanged" without touching the database, so idle
 * tablets let the Neon compute suspend. Any write — including a master PIN
 * change — moves the version, and the next poll rebuilds the snapshot with the
 * full device check.
 */
export async function GET(request: NextRequest) {
  const token = await readDeviceToken();
  if (!token) return NextResponse.json({ error: 'Device locked' }, { status: 401, headers });
  // Read before building, so a write during the build shows up on the next poll
  const version = `${await dataVersion()}|${businessDateWIB(new Date())}`;
  if (request.nextUrl.searchParams.get('v') === version) return NextResponse.json({ unchanged: true, version }, { headers });

  try {
    // Full device check: the session must be for the current master PIN
    const outlet = await getCurrentOutlet();
    if (token.pinVersion !== outlet.setting.pin_version) return NextResponse.json({ error: 'Device locked' }, { status: 401, headers });
    return NextResponse.json({ ...(await buildSnapshot(token.deviceId, outlet)), version }, { headers });
  } catch (error) {
    console.error('POS snapshot failed:', error);
    return NextResponse.json({ error: 'Server sedang bermasalah, coba lagi' }, { status: 503, headers });
  }
}
