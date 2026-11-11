// Café bills that used a voucher, reported to tokoiboek after the payment is
// saved (never blocking it). Run from the till's sync/snapshot requests and the
// daily cron; failures wait longer each time.
import { prisma } from '@/lib/prisma';
import { queueSync } from '@/lib/replica-sync';
import { tokoiboekConfig } from './mirror';

const FIRST_WAIT_MS = 60_000;
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;
export const retryWait = (attempts: number) => Math.min(FIRST_WAIT_MS * 2 ** (attempts - 1), MAX_WAIT_MS);

type RedeemReply = { ok: true } | { ok: false; conflict: { channel: string | null; ref: string | null; at: string | null } } | { ok: false; reason: string };

async function post(path: string, body: object) {
  const cfg = tokoiboekConfig()!;
  const res = await fetch(`${cfg.url}/api/integrations/vouchers/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Sends what is due: redemptions to report and refunded bills' codes to release.
 * A few per request (the cron takes more); stops at the first failure, since
 * tokoiboek being down fails them all.
 */
export async function processRedemptions({ now = new Date(), limit = 5 }: { now?: Date; limit?: number } = {}) {
  if (!tokoiboekConfig()) return { processed: 0 };
  const due = await prisma.voucherRedemption.findMany({
    where: { state: { in: ['pending', 'releasing'] }, next_attempt_at: { lte: now } },
    include: { order: { select: { code: true } } },
    orderBy: { next_attempt_at: 'asc' },
    take: limit,
  });
  for (const r of due) {
    const attempts = r.attempts + 1;
    try {
      if (r.state === 'pending') {
        const reply = (await post('redeem', { code: r.code, ref: r.order.code, amount: r.amount, at: r.at.toISOString() })) as RedeemReply;
        const data = reply.ok ? { state: 'ok', detail: undefined }
          : 'conflict' in reply ? { state: 'conflict', detail: reply.conflict }
          : { state: 'rejected', detail: { reason: reply.reason } };
        const { count } = await prisma.voucherRedemption.updateMany({
          where: { id: r.id, state: 'pending' }, data: { ...data, attempts, last_error: null },
        });
        // Refunded while we were redeeming: give the code back
        if (!count && reply.ok) await prisma.voucherRedemption.updateMany({ where: { id: r.id, state: 'released' }, data: { state: 'releasing', next_attempt_at: now } });
        // The till marked the code used by this bill; tokoiboek says someone else had it
        if (!reply.ok && 'conflict' in reply) {
          const { count: fixed } = await prisma.voucher.updateMany({
            where: { code: r.code, used_channel: 'cafe', used_ref: r.order.code },
            data: { status: 'USED', used_channel: reply.conflict.channel, used_ref: reply.conflict.ref, used_at: reply.conflict.at ? new Date(reply.conflict.at) : null },
          });
          if (fixed) queueSync({ vouchers: [r.code] });
        }
      } else {
        await post('release', { code: r.code, ref: r.order.code });
        await prisma.voucherRedemption.updateMany({ where: { id: r.id, state: 'releasing' }, data: { state: 'released', attempts, last_error: null } });
      }
    } catch (error) {
      await prisma.voucherRedemption.updateMany({
        where: { id: r.id, state: r.state },
        data: { attempts, last_error: String((error as Error)?.message ?? error).slice(0, 300), next_attempt_at: new Date(now.getTime() + retryWait(attempts)) },
      });
      queueSync({ orders: [r.order_id] });
      break;
    }
    queueSync({ orders: [r.order_id] });
  }
  return { processed: due.length };
}
