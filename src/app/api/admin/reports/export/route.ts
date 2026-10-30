import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { getCurrentOutlet } from '@/lib/outlet';
import { businessDateWIB } from '@/lib/pos/codes';
import { loadReportData } from '@/lib/reports/load';
import { periodFromParams } from '@/lib/reports/params';
import { REPORTS, reportTable, type ReportName } from '@/lib/reports/tables';
import { toCsv } from '@/lib/reports/csv';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const report = sp.report as ReportName;
  if (!REPORTS.includes(report)) return NextResponse.json({ error: 'Laporan tidak dikenal' }, { status: 400 });

  const { period } = periodFromParams(sp, businessDateWIB(new Date()));
  const outlet = await getCurrentOutlet();
  const { headers, rows } = reportTable(report, await loadReportData(outlet.id, period));
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="maraca-${report}-${period.from}_${period.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
