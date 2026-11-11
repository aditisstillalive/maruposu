import { NextRequest, NextResponse } from 'next/server';
import { voucherHousekeeping } from '@/lib/vouchers/sync';

export const maxDuration = 300;

// Daily Vercel cron: catch up with tokoiboek (pull) and retry voucher redemptions
// even when no till is online.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await voucherHousekeeping({ force: true, limit: 25 }));
}
