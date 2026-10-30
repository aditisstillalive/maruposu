// Shared by the tablet (offline) and the server, so a bill totals the same on both.
// Money is whole rupiah; rates are basis points (1000 = 10%).

export type LineOption = { option_id: string; group_name: string; name: string; price_delta: number };

export type CartLine = {
  id: string;
  product_id: string;
  category_id: string;
  name: string;
  base_price: number;
  options: LineOption[];
  qty: number;
  note: string | null;
};

export type TaxRule = { name: string; rate_bp: number; inclusive: boolean };

export type PromoRule = {
  id: string;
  name: string;
  code: string | null;
  kind: 'percent' | 'amount';
  value: number; // bp for percent, rupiah for amount
  max_discount: number | null;
  scope: 'bill' | 'product' | 'category';
  product_ids: string[];
  category_ids: string[];
  min_spend: number;
  starts_at: string | null;
  ends_at: string | null;
  days: number[]; // WIB weekdays, 0 = Sunday; empty = every day
  time_start: string | null; // "HH:mm" WIB
  time_end: string | null;
  quota: number | null;
  used_count: number;
  is_active: boolean;
};

export type MenuOption = { id: string; name: string; price_delta: number; is_default: boolean };
export type MenuGroup = {
  id: string;
  name: string;
  kind: 'variant' | 'addon';
  required: boolean;
  min_select: number;
  max_select: number;
  options: MenuOption[];
};
export type MenuProduct = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  photo_url: string | null;
  is_sold_out: boolean;
  groups: MenuGroup[];
};

export type LineMoney = { discount: number; paid: number };

export type Totals = { subtotal: number; discount: number; tax: number; total: number; lines: Record<string, LineMoney> };

export type PaymentMethod = 'cash' | 'edc' | 'qris';
