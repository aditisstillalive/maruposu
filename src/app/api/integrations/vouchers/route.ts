import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { upsertVouchers } from '@/lib/vouchers/mirror';
import { validSyncToken } from '@/lib/vouchers/token';

export const dynamic = 'force-dynamic';

/**
 * tokoiboek pushes vouchers here after a batch is created, a code voided, or
 * used/released on the web: { vouchers: [...] } in chunks of ≤500. Best-effort
 * on their side; our pull catches up anything missed.
 */
export async function POST(request: NextRequest) {
  if (!validSyncToken(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { vouchers?: unknown } | null;
  if (!body || !Array.isArray(body.vouchers) || body.vouchers.length > 1000) {
    return NextResponse.json({ error: 'Body harus { vouchers: [...] } (maks. 1000)' }, { status: 400 });
  }
  try {
    const changed = await upsertVouchers(body.vouchers);
    return NextResponse.json({ ok: true, received: body.vouchers.length, changed: changed.length });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Data voucher tidak valid', issues: error.issues.slice(0, 5) }, { status: 400 });
    console.error('Voucher push failed:', error);
    return NextResponse.json({ error: 'Gagal menyimpan voucher' }, { status: 500 });
  }
}
