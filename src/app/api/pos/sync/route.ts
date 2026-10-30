import { NextRequest, NextResponse } from 'next/server';
import { readDevice } from '@/lib/device';
import { applyMutations } from '@/lib/pos/apply';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BATCH = 100;

// The tablet's outbox. Answers per mutation; a 5xx means "keep it and retry".
export async function POST(request: NextRequest) {
  const device = await readDevice();
  if (!device) return NextResponse.json({ error: 'Device locked' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const mutations = body?.mutations;
  if (!Array.isArray(mutations) || mutations.length === 0 || mutations.length > MAX_BATCH) {
    return NextResponse.json({ error: `Kirim 1–${MAX_BATCH} mutation` }, { status: 400 });
  }

  try {
    return NextResponse.json(await applyMutations(device.deviceId, mutations));
  } catch (error) {
    console.error('POS sync failed:', error);
    return NextResponse.json({ error: 'Server sedang bermasalah, coba lagi' }, { status: 503 });
  }
}
