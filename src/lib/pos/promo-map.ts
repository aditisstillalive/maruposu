import type { Promo } from '@prisma/client';
import type { PromoRule } from './types';

/** DB row → the shape the pricing code (and the tablet) works with. */
export function toPromoRule(p: Promo): PromoRule {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    kind: p.kind as PromoRule['kind'],
    value: p.value,
    max_discount: p.max_discount,
    scope: p.scope as PromoRule['scope'],
    product_ids: p.product_ids,
    category_ids: p.category_ids,
    min_spend: p.min_spend,
    starts_at: p.starts_at?.toISOString() ?? null,
    ends_at: p.ends_at?.toISOString() ?? null,
    days: p.days,
    time_start: p.time_start,
    time_end: p.time_end,
    quota: p.quota,
    used_count: p.used_count,
    is_active: p.is_active,
  };
}
