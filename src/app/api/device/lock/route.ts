import { NextResponse } from 'next/server';
import { DEVICE_COOKIE } from '@/lib/device-session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(DEVICE_COOKIE);
  return response;
}
