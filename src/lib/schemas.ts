import { z } from 'zod';
import { denominationsInput } from '@/lib/pos/mutations';

// Request bodies for the admin API. Money is whole rupiah (Int); rates are stored
// as basis points so 10% = 1000 and 11.5% = 1150 without floats in the DB.

const name = z.string().trim().min(1, 'Nama wajib diisi').max(80);
const rupiah = z.number().int('Harus bilangan bulat').min(0).max(100_000_000);
const optionalUrl = z.string().url().nullish().transform(v => v ?? null);

// Rejected because they're the first PINs anyone tries.
const WEAK_PINS = new Set(['123456', '654321', '012345', '123123', '112233']);

export const masterPinSchema = z
  .object({ pin: z.string().regex(/^\d{6}$/, 'PIN harus 6 digit'), confirm: z.string() })
  .refine(v => v.pin === v.confirm, { message: 'Konfirmasi PIN tidak sama', path: ['confirm'] })
  .refine(v => !/^(\d)\1{5}$/.test(v.pin) && !WEAK_PINS.has(v.pin), { message: 'PIN terlalu mudah ditebak', path: ['pin'] });

// Minimum length for admin passwords: new accounts (Admin → Users), password
// changes and the seeded super admin.
export const ADMIN_PASSWORD_MIN = 8;

export const passwordChangeSchema = z
  .object({
    current: z.string().min(1, 'Password lama wajib diisi'),
    password: z.string().min(ADMIN_PASSWORD_MIN, `Password baru minimal ${ADMIN_PASSWORD_MIN} karakter`).max(200),
    confirm: z.string(),
  })
  .refine(v => v.password === v.confirm, { message: 'Konfirmasi password tidak sama', path: ['confirm'] })
  .refine(v => v.password !== v.current, { message: 'Password baru harus berbeda dari yang lama', path: ['password'] });

export const settingSchema = z
  .object({
    cafe_name: name,
    tax_name: z.string().trim().min(1).max(20),
    tax_rate: z.number().min(0).max(100),
    tax_inclusive: z.boolean(),
    receipt_footer: z.string().trim().max(300).nullish(),
  })
  .transform(({ tax_rate, receipt_footer, ...rest }) => ({
    ...rest,
    tax_rate_bp: Math.round(tax_rate * 100),
    receipt_footer: receipt_footer || null,
  }));

export const employeeSchema = z.object({
  name,
  photo_url: optionalUrl,
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const categorySchema = z.object({
  name,
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

export const productSchema = z.object({
  name,
  category_id: z.string().min(1),
  description: z.string().trim().max(500).nullish().transform(v => v || null),
  price: rupiah,
  photo_url: optionalUrl,
  is_active: z.boolean().default(true),
  is_sold_out: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  option_group_ids: z.array(z.string()).default([]),
});

const optionSchema = z.object({
  id: z.string().optional(), // existing option: keep its id (recipes hang off it)
  name,
  price_delta: rupiah,
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const optionGroupSchema = z
  .object({
    name,
    kind: z.enum(['variant', 'addon']),
    required: z.boolean(),
    max_select: z.number().int().min(1).max(20).default(1),
    options: z.array(optionSchema).min(1, 'Minimal satu pilihan'),
  })
  .refine(g => g.kind === 'addon' || g.options.filter(o => o.is_default).length <= 1, {
    message: 'Varian hanya boleh punya satu pilihan default',
    path: ['options'],
  })
  .transform(g =>
    g.kind === 'variant'
      ? { ...g, min_select: g.required ? 1 : 0, max_select: 1 }
      : { ...g, min_select: g.required ? 1 : 0 }
  );

export type OptionGroupInput = z.infer<typeof optionGroupSchema>;

export const DUPLICATE_CODE = 'Kode kupon sudah dipakai';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:mm');

// A promo as the admin enters it. Percent values arrive as a percentage (10)
// and are stored as basis points (1000), like the tax rate.
export const promoSchema = z
  .object({
    name,
    code: z.string().trim().max(30).nullish().transform(v => (v ? v.toUpperCase() : null)),
    kind: z.enum(['percent', 'amount']),
    value: z.number().positive(),
    max_discount: rupiah.nullish().transform(v => v ?? null),
    scope: z.enum(['bill', 'product', 'category']),
    product_ids: z.array(z.string()).default([]),
    category_ids: z.array(z.string()).default([]),
    min_spend: rupiah.default(0),
    starts_at: z.string().datetime().nullish().transform(v => v ?? null),
    ends_at: z.string().datetime().nullish().transform(v => v ?? null),
    days: z.array(z.number().int().min(0).max(6)).default([]),
    // <input type="time"> sends '' when left empty
    time_start: z.preprocess(v => (v === '' ? null : v), hhmm.nullish()).transform(v => v ?? null),
    time_end: z.preprocess(v => (v === '' ? null : v), hhmm.nullish()).transform(v => v ?? null),
    quota: z.number().int().positive().nullish().transform(v => v ?? null),
    is_active: z.boolean().default(true),
  })
  .refine(p => p.kind === 'amount' || p.value <= 100, { message: 'Persen maksimal 100', path: ['value'] })
  .refine(p => p.kind === 'percent' || Number.isInteger(p.value), { message: 'Nominal harus bilangan bulat', path: ['value'] })
  .refine(p => p.scope !== 'product' || p.product_ids.length > 0, { message: 'Pilih minimal satu produk', path: ['product_ids'] })
  .refine(p => p.scope !== 'category' || p.category_ids.length > 0, { message: 'Pilih minimal satu kategori', path: ['category_ids'] })
  .refine(p => !p.time_start === !p.time_end, { message: 'Isi jam mulai dan jam selesai', path: ['time_end'] })
  .refine(p => !p.time_start || !p.time_end || p.time_start < p.time_end, { message: 'Jam selesai harus setelah jam mulai', path: ['time_end'] })
  .refine(p => !p.starts_at || !p.ends_at || p.starts_at < p.ends_at, { message: 'Tanggal selesai harus setelah tanggal mulai', path: ['ends_at'] })
  .transform(p => ({ ...p, value: p.kind === 'percent' ? Math.round(p.value * 100) : p.value }));

/** First validation message, for a 400 response. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Data tidak valid';
}

// Closing a shift from the back office (tablet lost, broken or forgotten).
export const adminCloseSchema = z.object({
  denominations: denominationsInput,
  reason: z.string().trim().min(1, 'Alasan wajib diisi').max(300),
});

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null);

export const ingredientSchema = z
  .object({
    name,
    unit: z.enum(['g', 'ml', 'pcs']),
    purchase_unit: optionalText(30),
    purchase_size: z.number().int().min(1).max(10_000_000).nullish().transform(v => v ?? null),
    min_stock: z.number().int().min(0).max(100_000_000).nullish().transform(v => v ?? null),
    is_active: z.boolean().default(true),
  })
  .refine(i => !i.purchase_unit || i.purchase_size, { message: 'Isi isi per satuan beli', path: ['purchase_size'] })
  .transform(i => (i.purchase_unit ? i : { ...i, purchase_size: null }));

export const purchaseSchema = z.object({
  supplier: optionalText(80),
  note: optionalText(300),
  lines: z
    .array(
      z.object({
        ingredient_id: z.string().min(1),
        amount: z.number().positive('Jumlah harus lebih dari 0').max(10_000_000),
        unit: z.enum(['base', 'purchase']),
        total_cost: z.number().int('Harga harus bilangan bulat').min(0).max(1_000_000_000),
      })
    )
    .min(1, 'Isi minimal satu bahan'),
});
