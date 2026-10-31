import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEVICE_COOKIE, deviceSecret, verifyDeviceToken, type DevicePayload } from '@/lib/device-session';
import { getCurrentOutlet } from '@/lib/outlet';

/** Device session that is signed and unexpired (no database check). */
export async function readDeviceToken(): Promise<DevicePayload | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  return verifyDeviceToken(token, deviceSecret());
}

/** Device session that is signed, unexpired, and issued for the current master PIN. */
export async function readDevice(): Promise<DevicePayload | null> {
  const payload = await readDeviceToken();
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
