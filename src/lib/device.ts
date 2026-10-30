import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEVICE_COOKIE, deviceSecret, verifyDeviceToken, type DevicePayload } from '@/lib/device-session';
import { getCurrentOutlet } from '@/lib/outlet';
import { prisma } from '@/lib/prisma';

export const CASHIER_COOKIE = 'maru_cashier';

/** Device session that is signed, unexpired, and issued for the current master PIN. */
export async function readDevice(): Promise<DevicePayload | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  const payload = await verifyDeviceToken(token, deviceSecret());
  if (!payload) return null;
  const { setting } = await getCurrentOutlet();
  return payload.pinVersion === setting.pin_version ? payload : null;
}

/** For POS pages: back to the PIN screen unless this device is unlocked. */
export async function requireDevice(): Promise<DevicePayload> {
  const device = await readDevice();
  if (!device) redirect('/');
  return device;
}

/** The employee picked on /staff, if still active. */
export async function readCashier() {
  const id = (await cookies()).get(CASHIER_COOKIE)?.value;
  if (!id) return null;
  return prisma.employee.findFirst({ where: { id, is_active: true }, select: { id: true, name: true, photo_url: true } });
}
