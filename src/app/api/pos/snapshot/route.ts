import { NextResponse } from 'next/server';
import { readDevice } from '@/lib/device';
import { buildSnapshot } from '@/lib/pos/snapshot';

export const dynamic = 'force-dynamic';

export async function GET() {
  const device = await readDevice();
  if (!device) return NextResponse.json({ error: 'Device locked' }, { status: 401 });
  try {
    return NextResponse.json(await buildSnapshot(device.deviceId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('POS snapshot failed:', error);
    return NextResponse.json({ error: 'Server sedang bermasalah, coba lagi' }, { status: 503 });
  }
}
