import { NextResponse } from 'next/server';
import { DEVICE_COOKIE } from '@/lib/device-session';
import { CASHIER_COOKIE } from '@/lib/device';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(DEVICE_COOKIE);
  response.cookies.delete(CASHIER_COOKIE);
  return response;
}
