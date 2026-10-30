import { z } from 'zod';

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

/** First validation message, for a 400 response. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Data tidak valid';
}
