import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { getCurrentOutlet } from '@/lib/outlet';
import { businessDateWIB } from '@/lib/pos/codes';
import { longDateID } from '@/lib/reports/dates';
import { loadReportData } from '@/lib/reports/load';
import { periodFromParams } from '@/lib/reports/params';
import { REPORTS, REPORT_TITLE, reportTable, tableCsv, type ReportName } from '@/lib/reports/tables';
import { toXlsx } from '@/lib/reports/xlsx';
import { filterOrders, ordersFilterFromParams } from '@/lib/reports/filters';

export const dynamic = 'force-dynamic';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** `?report=<name>|all&format=csv|xlsx` plus the period (and transaction filters). */
export async function GET(request: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const xlsx = sp.format === 'xlsx';
  const all = sp.report === 'all';
  const report = sp.report as ReportName;
  if (!(all ? xlsx : REPORTS.includes(report))) return NextResponse.json({ error: 'Laporan tidak dikenal' }, { status: 400 });

  const { period } = periodFromParams(sp, businessDateWIB(new Date()));
  const outlet = await getCurrentOutlet();
  const data = await loadReportData(outlet.id, period);
  const filename = `maraca-${all ? 'laporan' : report}-${period.from}_${period.to}.${xlsx ? 'xlsx' : 'csv'}`;
  const headers = { 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' };

  if (!xlsx) {
    // The transaction detail exports what the filtered screen shows
    if (report === 'transactions') data.orders = filterOrders(data.orders, ordersFilterFromParams(sp));
    return new NextResponse(tableCsv(reportTable(report, data)), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } });
  }

  const range = period.from === period.to ? longDateID(period.from) : `${longDateID(period.from)} – ${longDateID(period.to)}`;
  const subtitle = `${outlet.setting.cafe_name} · ${range} (hari bisnis s/d 04:00 WIB)`;
  const names = all ? (Object.keys(REPORT_TITLE) as ReportName[]) : [report];
  const filtered = { ...data, orders: filterOrders(data.orders, ordersFilterFromParams(sp)) };
  const sheets = names.map(name => ({
    name: REPORT_TITLE[name][0],
    title: REPORT_TITLE[name][1],
    subtitle,
    // Only a single transaction export follows the screen's filters; "all" is the full recap
    table: reportTable(name, !all && name === 'transactions' ? filtered : data),
  }));
  return new NextResponse(Buffer.from(toXlsx(sheets)), { headers: { ...headers, 'Content-Type': XLSX_TYPE } });
}
