import { Download, FileSpreadsheet } from 'lucide-react';
import type { ReportName } from '@/lib/reports/tables';

/** Excel and CSV of the current report (with its filters), and every report of the period in one workbook. */
export default function ExportButtons({ query, csv, csvQuery = {} }: { query: Record<string, string>; csv: ReportName; csvQuery?: Record<string, string> }) {
  return (
    <div className="flex flex-wrap items-center gap-1 print:hidden">
      {[
        { label: 'Unduh Excel', icon: FileSpreadsheet, q: { report: csv, format: 'xlsx' }, extra: csvQuery },
        { label: 'Unduh CSV', icon: Download, q: { report: csv, format: 'csv' }, extra: csvQuery },
        { label: 'Semua laporan', icon: FileSpreadsheet, q: { report: 'all', format: 'xlsx' }, extra: {} },
      ].map(b => (
        <a
          key={b.label}
          href={`/api/admin/reports/export?${new URLSearchParams({ ...query, ...b.extra, ...b.q })}`}
          download
          title={b.label === 'Semua laporan' ? 'Semua laporan periode ini dalam satu file Excel' : undefined}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm hover:bg-gray-50"
        >
          <b.icon className="h-4 w-4" />
          {b.label}
        </a>
      ))}
    </div>
  );
}
