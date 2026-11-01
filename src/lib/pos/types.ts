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

export type OrderStatus = 'open' | 'paid' | 'void' | 'refunded';
export type OrderType = 'dine_in' | 'takeaway';

export type OrderItemDoc = CartLine & {
  /** 'qr': ordered by the customer from the table */
  origin?: 'pos' | 'qr';
  sort_order: number;
  discount: number;
  paid: number;
  refunded_qty: number;
  refunded_amount: number;
};

export type RefundDoc = {
  id: string;
  shift_id: string; // the shift whose drawer it came out of
  method: 'cash' | 'cashless';
  amount: number;
  tax: number;
  reason: string;
  employee_id: string;
  created_at: string;
  items: { order_item_id: string; qty: number; amount: number }[];
};

/** An order as the tablet keeps it; the server returns the same shape. */
export type OrderDoc = {
  id: string;
  shift_id: string;
  code: string;
  number: number;
  business_date: string;
  status: OrderStatus;
  order_type: OrderType;
  customer_name: string | null;
  table_no: string | null;
  created_by: string;
  paid_by: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  promo_id: string | null;
  promo_name: string | null;
  payment_method: PaymentMethod | null;
  cash_received: number | null;
  change: number | null;
  payment_ref: string | null;
  paid_at: string | null;
  void_reason: string | null;
  created_at: string;
  items: OrderItemDoc[];
  refunds: RefundDoc[];
  /** 'qr': opened by a customer from the table's QR page (missing on older docs = 'pos') */
  source?: 'pos' | 'qr';
  table_id?: string | null;
  /** last customer submit; an unclaimed QR bill is voided 30 min after it */
  qr_activity_at?: string | null;
  /** first saved or paid by a cashier */
  claimed_at?: string | null;
  /** Tablet only: item ids the till had when it last got this bill from the server (see order.save). */
  seen_item_ids?: string[];
};

export type ShiftDoc = {
  id: string;
  business_date: string;
  opening_float: number;
  opened_by: string;
  opened_at: string;
  status: 'open' | 'closed';
};

export type CashMoveDoc = {
  id: string;
  shift_id: string;
  kind: 'paid_in' | 'paid_out' | 'refund_out';
  amount: number;
  note: string;
  employee_id: string;
  created_at: string;
};

/**
 * Receipt logo as the thermal printer prints it: 1 bit per dot (1 = black),
 * rows of width/8 bytes, base64. `preview` is the same image as a PNG data URL.
 */
export type ReceiptLogo = { width: number; height: number; bits: string; preview: string };

export type SnapshotEmployee = { id: string; name: string; photo_url: string | null };
export type SnapshotCategory = { id: string; name: string };

export type Snapshot = {
  device_tag: string;
  setting: {
    cafe_name: string; address: string | null; tax: TaxRule; receipt_footer: string | null;
    receipt_header: string | null; receipt_logo: ReceiptLogo | null;
  };
  employees: SnapshotEmployee[];
  categories: SnapshotCategory[];
  products: MenuProduct[];
  promos: PromoRule[];
  shift: ShiftDoc | null;
  orders: OrderDoc[];
  cash_moves: CashMoveDoc[];
  fetched_at: string;
  /** Data version this snapshot was built at; send it back as ?v= to get "unchanged". */
  version?: string;
  // Highest bill number this tablet used today, closed shifts included, so a
  // wiped tablet doesn't reuse a code
  day_numbers: { business_date: string; max_number: number };
  ingredients: { id: string; name: string; unit: string }[];
  low_stock: { count: number; names: string[] };
};
