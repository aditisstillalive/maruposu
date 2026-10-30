// Lightweight rows the report functions work on (see load.ts).

export type Period = { from: string; to: string }; // business days, inclusive

export type ReportItem = {
  product_id: string;
  category_id: string;
  category_name: string;
  name: string;
  qty: number;
  paid: number;
  cogs: number;
  refunded_qty: number;
  refunded_amount: number;
  options: string[];
};

export type ReportOrder = {
  id: string;
  code: string;
  number: number;
  business_date: string;
  status: 'paid' | 'refunded' | 'void' | 'open';
  order_type: 'dine_in' | 'takeaway';
  customer_name: string | null;
  created_by: string;
  paid_by: string | null;
  paid_at: string | null;
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  promo_id: string | null;
  promo_name: string | null;
  payment_method: 'cash' | 'edc' | 'qris' | null;
  void_reason: string | null;
  voided_by: string | null;
  items: ReportItem[];
};

export type ReportRefund = {
  id: string;
  order_id: string;
  order_code: string;
  business_date: string;
  method: 'cash' | 'cashless';
  amount: number;
  tax: number;
  reason: string;
  employee_id: string;
  created_at: string;
  items: { name: string; product_id: string; category_id: string; category_name: string; qty: number; amount: number }[];
};

export type ReportData = { period: Period; orders: ReportOrder[]; refunds: ReportRefund[]; employees: Record<string, string> };
