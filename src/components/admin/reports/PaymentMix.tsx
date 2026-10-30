import { formatRupiah } from '@/lib/money';
import { METHOD_LABEL } from '@/lib/reports/tables';
import type { byPayment } from '@/lib/reports/aggregate';

/** Share of gross sales per payment method: one bar each, every value labeled. */
export default function PaymentMix({ data }: { data: ReturnType<typeof byPayment> }) {
  if (!data.methods.length) return <p className="text-sm text-muted-foreground">Belum ada pembayaran.</p>;
  const refunds = data.refunds.cash + data.refunds.cashless;
  return (
    <div className="space-y-3">
      {data.methods.map(m => (
        <div key={m.method}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{METHOD_LABEL[m.method]}</span>
            <span className="tabular-nums text-gray-600">
              {formatRupiah(m.amount)} · {m.transactions} bill · {(m.share * 100).toLocaleString('id-ID', { maximumFractionDigits: 0 })}%
            </span>
          </div>
          <div className="h-3 rounded-r bg-transparent">
            <div className="h-3 rounded-r" style={{ width: `${Math.max(1, m.share * 100)}%`, maxWidth: '100%', background: 'var(--chart-sales)' }} />
          </div>
        </div>
      ))}
      {refunds > 0 && (
        <p className="text-xs text-muted-foreground">
          Refund: {formatRupiah(data.refunds.cash)} tunai · {formatRupiah(data.refunds.cashless)} non-tunai
        </p>
      )}
    </div>
  );
}
