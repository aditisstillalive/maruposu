// The local mirror of tokoiboek's vouchers: filled by tokoiboek's pushes and by
// a throttled pull (the safety net), read by the till's snapshot.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { queueSync } from '@/lib/replica-sync';
import { normalizeCode, type VoucherRule } from './rules';

const iso = z.string().datetime({ offset: true });
export const wireVoucher = z.object({
  code: z.string().refine(c => normalizeCode(c) === c, 'Kode voucher tidak valid'),
  batch_name: z.string().max(200),
  kind: z.enum(['amount', 'percent']),
  value: z.number().int().min(0),
  max_discount: z.number().int().min(0).nullable(),
  min_spend: z.number().int().min(0),
  expires_at: iso,
  channels: z.enum(['web', 'cafe', 'both']),
  status: z.enum(['ACTIVE', 'RESERVED', 'USED', 'VOID']),
  used_channel: z.enum(['web', 'cafe']).nullable(),
  used_ref: z.string().max(200).nullable(),
  used_at: iso.nullable(),
  updated_at: iso,
});
export type WireVoucher = z.infer<typeof wireVoucher>;

export const tokoiboekConfig = () => {
  const url = process.env.TOKOIBOEK_URL?.replace(/\/$/, '');
  const token = process.env.VOUCHER_SYNC_TOKEN;
  return url && token ? { url, token } : null;
};

/**
 * Saves vouchers as tokoiboek sent them. A row is only replaced by a newer
 * version (updated_at), so a late push can't undo a later change. Returns the
 * codes that changed (and syncs them to the replica, which also tells tablets).
 */
export async function upsertVouchers(input: unknown[]): Promise<string[]> {
  const rows = z.array(wireVoucher).parse(input);
  const changed: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const values = rows.slice(i, i + 200).map(v => Prisma.sql`(
      ${v.code}, ${v.batch_name}, ${v.kind}, ${v.value}, ${v.max_discount}, ${v.min_spend}, ${new Date(v.expires_at)}, ${v.channels}, ${v.status},
      ${v.used_channel}, ${v.used_ref}, ${v.used_at ? new Date(v.used_at) : null}, ${new Date(v.updated_at)}, now())`);
    const done = await prisma.$queryRaw<{ code: string }[]>`
      INSERT INTO "Voucher" (code, batch_name, kind, value, max_discount, min_spend, expires_at, channels, status, used_channel, used_ref, used_at, updated_at, synced_at)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (code) DO UPDATE SET
        batch_name = EXCLUDED.batch_name, kind = EXCLUDED.kind, value = EXCLUDED.value, max_discount = EXCLUDED.max_discount,
        min_spend = EXCLUDED.min_spend, expires_at = EXCLUDED.expires_at, channels = EXCLUDED.channels, status = EXCLUDED.status,
        used_channel = EXCLUDED.used_channel, used_ref = EXCLUDED.used_ref, used_at = EXCLUDED.used_at,
        updated_at = EXCLUDED.updated_at, synced_at = now()
      WHERE "Voucher".updated_at < EXCLUDED.updated_at
      RETURNING code`;
    changed.push(...done.map(r => r.code));
  }
  if (changed.length) queueSync({ vouchers: changed });
  return changed;
}

const CURSOR_ID = 'tokoiboek';
export const PULL_EVERY_MS = 60_000;

/**
 * Pulls what changed on tokoiboek since the stored cursor, at most once a
 * minute (unless forced). Returns null when it didn't run.
 */
export async function pullVouchers({ now = new Date(), force = false }: { now?: Date; force?: boolean } = {}) {
  const cfg = tokoiboekConfig();
  if (!cfg) return null;
  await prisma.voucherSyncCursor.upsert({ where: { id: CURSOR_ID }, create: { id: CURSOR_ID }, update: {} });
  // Claim the slot, so two requests never pull at once
  const { count } = await prisma.voucherSyncCursor.updateMany({
    where: { id: CURSOR_ID, ...(force ? {} : { OR: [{ pulled_at: null }, { pulled_at: { lte: new Date(now.getTime() - PULL_EVERY_MS) } }] }) },
    data: { pulled_at: now },
  });
  if (!count) return null;

  let cursor = await prisma.voucherSyncCursor.findUniqueOrThrow({ where: { id: CURSOR_ID } });
  let pulled = 0;
  const changed = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const qs = cursor.since ? `?${new URLSearchParams({ since: cursor.since, ...(cursor.after_code ? { after_code: cursor.after_code } : {}) })}` : '';
    const res = await fetch(`${cfg.url}/api/integrations/vouchers${qs}`, {
      headers: { Authorization: `Bearer ${cfg.token}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`tokoiboek voucher pull: HTTP ${res.status}`);
    const body = (await res.json()) as { vouchers: unknown[]; more: boolean; next: { since: string; after_code: string | null } | null };
    pulled += body.vouchers.length;
    for (const c of await upsertVouchers(body.vouchers)) changed.add(c);
    if (body.next) {
      cursor = await prisma.voucherSyncCursor.update({ where: { id: CURSOR_ID }, data: { since: body.next.since, after_code: body.next.after_code } });
    }
    if (!body.more || !body.next) break;
  }
  return { pulled, changed: changed.size };
}

/** For the till: active café codes that haven't expired, each pointing at its batch's rule. */
export async function cafeVouchers(now: Date): Promise<{ rules: VoucherRule[]; codes: Record<string, number> }> {
  const rows = await prisma.voucher.findMany({
    where: { status: 'ACTIVE', channels: { in: ['cafe', 'both'] }, expires_at: { gt: now } },
    orderBy: { code: 'asc' },
  });
  const rules: VoucherRule[] = [];
  const index = new Map<string, number>();
  const codes: Record<string, number> = {};
  for (const v of rows) {
    const rule: VoucherRule = {
      batch_name: v.batch_name, kind: v.kind as VoucherRule['kind'], value: v.value, max_discount: v.max_discount,
      min_spend: v.min_spend, expires_at: v.expires_at.toISOString(), channels: v.channels as VoucherRule['channels'],
    };
    const key = JSON.stringify(rule);
    if (!index.has(key)) { index.set(key, rules.length); rules.push(rule); }
    codes[v.code] = index.get(key)!;
  }
  return { rules, codes };
}
