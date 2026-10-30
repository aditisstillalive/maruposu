import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { clientIp } from '@/lib/rate-limit';
import { getCurrentOutlet } from '@/lib/outlet';
import { isLocked, isValidPinFormat, nextThrottle, verifyMasterPin } from '@/lib/master-pin';
import { businessDayEnd, DEVICE_COOKIE, deviceSecret, signDeviceToken } from '@/lib/device-session';

// Checks the master PIN and, on success, unlocks this device until 04:00 WIB.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const pin = body?.pin;
  if (!isValidPinFormat(pin)) {
    return NextResponse.json({ error: 'PIN harus 6 digit' }, { status: 400 });
  }

  const now = new Date();
  const key = `ip:${clientIp(request.headers)}`;
  const throttle = await prisma.pinThrottle.findUnique({ where: { key } });
  if (isLocked(throttle, now)) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan. Coba lagi nanti.', locked_until: throttle!.locked_until },
      { status: 429 }
    );
  }

  const { setting } = await getCurrentOutlet();
  if (!(await verifyMasterPin(pin, setting.master_pin_hash))) {
    const next = nextThrottle(throttle ?? { failures: 0, locked_until: null }, now);
    await prisma.pinThrottle.upsert({ where: { key }, create: { key, ...next }, update: next });
    return NextResponse.json({ error: 'PIN salah' }, { status: 401 });
  }

  if (throttle) await prisma.pinThrottle.delete({ where: { key } });

  const exp = businessDayEnd(now);
  const deviceId = request.cookies.get('maru_device_id')?.value || crypto.randomUUID();
  const token = await signDeviceToken({ deviceId, pinVersion: setting.pin_version, exp: exp.getTime() }, deviceSecret());

  const response = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(DEVICE_COOKIE, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', expires: exp });
  // Stable per-tablet id; later used to number orders created offline.
  response.cookies.set('maru_device_id', deviceId, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 365 * 5 });
  return response;
}
