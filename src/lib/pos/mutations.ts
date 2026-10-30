import { z } from 'zod';

// Everything the tablet can do, as a queued message. Each carries a UUID made on
// the tablet; the server applies a given id at most once.

const id = z.string().uuid();
const rupiah = z.number().int().min(0).max(100_000_000);
const employeeId = z.string().min(1);
const text = (max: number) => z.string().trim().max(max);
const required = (max: number, message: string) => z.string().trim().min(1, message).max(max);

const base = { id, created_at: z.string().datetime() };

const lineOption = z.object({
  option_id: z.string(),
  group_name: text(80),
  name: text(80),
  price_delta: rupiah,
});

export const orderItemInput = z.object({
  id,
  product_id: z.string(),
  category_id: z.string(),
  name: required(120, 'Nama item kosong'),
  base_price: rupiah,
  options: z.array(lineOption).max(30),
  qty: z.number().int().min(1).max(999),
  note: text(200).nullable(),
  sort_order: z.number().int().min(0),
});

export const orderInput = z.object({
  id,
  shift_id: id,
  code: z.string().regex(/^\d{6}-[0-9A-F]{2}-\d{3,}$/),
  number: z.number().int().min(1),
  business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  order_type: z.enum(['dine_in', 'takeaway']),
  customer_name: text(60).nullable(),
  table_no: text(20).nullable(),
  created_by: employeeId,
  created_at: z.string().datetime(),
  items: z.array(orderItemInput).min(1, 'Bill kosong').max(200),
});

export const WASTE_REASONS = ['rusak', 'kadaluarsa', 'salah_buat', 'tumpah', 'lainnya'] as const;

export const denominationsInput = z.object({
  notes: z.record(z.string().regex(/^\d+$/), z.number().int().min(0).max(100_000)),
  coins: rupiah,
});

const totals = z.object({ subtotal: rupiah, discount: rupiah, tax: rupiah, total: rupiah });

export const mutationSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('shift.open'),
    shift_id: id,
    opening_float: rupiah,
    employee_id: employeeId,
    business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({ ...base, type: z.literal('order.save'), order: orderInput }),
  z.object({
    ...base,
    type: z.literal('shift.close'),
    shift_id: id,
    denominations: denominationsInput,
    counted_cash: rupiah,
    note: text(500).nullable(),
    employee_id: employeeId,
    client_expected: z.number().int(),
  }),
  z.object({
    ...base,
    type: z.literal('order.pay'),
    order_id: id,
    promo_id: z.string().nullable(),
    method: z.enum(['cash', 'edc', 'qris']),
    cash_received: rupiah.nullable(),
    payment_ref: text(60).nullable(),
    employee_id: employeeId,
    client_totals: totals,
    // The tablet's per-line split of discount and total, used when the server's math differs
    client_lines: z.record(z.string(), z.object({ discount: rupiah, paid: rupiah })).optional(),
  }),
  z.object({ ...base, type: z.literal('order.void'), order_id: id, reason: required(200, 'Alasan wajib diisi'), employee_id: employeeId }),
  z.object({
    ...base,
    type: z.literal('order.refund'),
    refund_id: id,
    order_id: id,
    method: z.enum(['cash', 'cashless']),
    reason: required(200, 'Alasan wajib diisi'),
    employee_id: employeeId,
    items: z.array(z.object({ order_item_id: id, qty: z.number().int().min(1) })).min(1, 'Pilih item yang di-refund'),
  }),
  z.object({
    ...base,
    type: z.literal('waste.record'),
    waste_id: id,
    reason: z.enum(WASTE_REASONS),
    note: text(200).nullable(),
    employee_id: employeeId,
    lines: z
      .array(
        z
          .object({ ingredient_id: z.string().optional(), product_id: z.string().optional(), option_ids: z.array(z.string()).max(20).optional(), qty: z.number().int().min(1).max(1_000_000) })
          .refine(l => !!l.ingredient_id !== !!l.product_id, 'Pilih bahan atau produk')
      )
      .min(1, 'Isi bahan atau produk yang terbuang')
      .max(50),
  }),
  z.object({
    ...base,
    type: z.literal('cash.move'),
    movement_id: id,
    shift_id: id,
    kind: z.enum(['paid_in', 'paid_out']),
    amount: rupiah.min(1, 'Nominal harus lebih dari 0'),
    note: required(200, 'Keterangan wajib diisi'),
    employee_id: employeeId,
  }),
]);

export type Mutation = z.infer<typeof mutationSchema>;
export type MutationType = Mutation['type'];
export type OrderInput = z.infer<typeof orderInput>;
