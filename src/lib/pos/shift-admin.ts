import { prisma } from '@/lib/prisma';
import { orderInclude, toOrderDoc } from './snapshot';
import { shiftSummary, type Denominations, type ShiftSummary } from './shift';
import type { CashMoveDoc, OrderDoc, ShiftDoc } from './types';

export type ShiftDetail = {
  shift: ShiftDoc & {
    closed_at: string | null;
    closed_by: string | null;
    closed_via: string | null;
    counted_cash: number | null;
    expected_cash: number | null;
    variance: number | null;
    close_note: string | null;
    sync_note: string | null;
    denominations: Denominations | null;
  };
  summary: ShiftSummary;
  orders: OrderDoc[];
  moves: CashMoveDoc[];
};

/** A shift with its bills and drawer moves; the summary is the stored one once closed. */
export async function loadShiftDetail(id: string): Promise<ShiftDetail | null> {
  const s = await prisma.shift.findUnique({ where: { id } });
  if (!s) return null;
  const [orders, moves, refunds] = await Promise.all([
    prisma.order.findMany({ where: { shift_id: id }, include: orderInclude, orderBy: { created_at: 'asc' } }),
    prisma.cashMovement.findMany({ where: { shift_id: id }, orderBy: { created_at: 'asc' } }),
    prisma.refund.findMany({ where: { shift_id: id }, include: { items: true } }),
  ]);
  const orderDocs = orders.map(toOrderDoc);
  const moveDocs = moves.map(m => ({ ...m, kind: m.kind as CashMoveDoc['kind'], created_at: m.created_at.toISOString() }));
  const summary = (s.summary as ShiftSummary | null) ??
    shiftSummary(s, orderDocs, moveDocs, refunds.map(r => ({ ...r, method: r.method as 'cash' | 'cashless', created_at: r.created_at.toISOString() })));
  return {
    shift: {
      id: s.id, business_date: s.business_date, opening_float: s.opening_float, opened_by: s.opened_by,
      opened_at: s.opened_at.toISOString(), status: s.status as 'open' | 'closed', closed_at: s.closed_at?.toISOString() ?? null,
      closed_by: s.closed_by, closed_via: s.closed_via, counted_cash: s.counted_cash, expected_cash: s.expected_cash,
      variance: s.variance, close_note: s.close_note, sync_note: s.sync_note, denominations: s.denominations as Denominations | null,
    },
    summary,
    orders: orderDocs,
    moves: moveDocs,
  };
}
