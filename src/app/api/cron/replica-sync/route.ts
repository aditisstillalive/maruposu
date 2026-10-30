import { NextRequest, NextResponse } from 'next/server';
import { fullSync, getReplicaStatus } from '@/lib/replica-sync';

export const maxDuration = 300;

// Daily Vercel cron: brings the replica back in sync if it missed changes
// (e.g. while it was over its Neon quota). Does nothing when already in sync.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const status = await getReplicaStatus();
  if (!status.configured || status.inSync) return NextResponse.json({ skipped: true, ...status });
  const result = await fullSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
