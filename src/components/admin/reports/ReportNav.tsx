'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Download, Wallet } from 'lucide-react';
import type { ReportName } from '@/lib/reports/tables';

const TABS = [
  { name: 'Ringkasan', href: '/admin/reports' },
  { name: 'Transaksi', href: '/admin/reports/transactions' },
  { name: 'Pembayaran', href: '/admin/reports/payments' },
  { name: 'Void & refund', href: '/admin/reports/voids' },
  { name: 'Produk', href: '/admin/reports/products' },
  { name: 'Promo', href: '/admin/reports/promos' },
  { name: 'Pajak', href: '/admin/reports/tax' },
  { name: 'Kasir', href: '/admin/reports/cashiers' },
  { name: 'Jam ramai', href: '/admin/reports/peak' },
];

/** Tabs between reports (keeping the period) and the CSV download of the current one. */
export default function ReportNav({ query, csv, csvQuery = {} }: { query: Record<string, string>; csv?: ReportName; csvQuery?: Record<string, string> }) {
  const pathname = usePathname();
  const qs = new URLSearchParams(query).toString();
  return (
    <div className="mb-4 flex items-center gap-2 border-b print:hidden">
      <nav aria-label="Laporan" className="-mb-px flex min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
        {TABS.map(t => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={`${t.href}?${qs}`}
              aria-current={active ? 'page' : undefined}
              className={`border-b-2 px-3 py-2 text-sm ${active ? 'border-black font-semibold' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            >
              {t.name}
            </Link>
          );
        })}
        <Link href="/admin/shifts" className="flex shrink-0 items-center gap-1 border-b-2 border-transparent px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
          <Wallet className="h-3.5 w-3.5" />
          Tutup kasir
        </Link>
      </nav>
      {csv && (
        <a
          href={`/api/admin/reports/export?${new URLSearchParams({ ...query, ...csvQuery, report: csv })}`}
          download
          className="mb-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Unduh CSV
        </a>
      )}
    </div>
  );
}
