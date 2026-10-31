import { assertAdmin } from '@/lib/admin-auth';
import { cachedRead } from '@/lib/data-cache';
import { getCurrentOutlet } from '@/lib/outlet';
import { businessDateWIB } from '@/lib/pos/codes';
import { loadReportData, primaryOnly } from './load';
import { periodFromParams } from './params';
import type { ReportData } from './types';

export type SearchParams = Record<string, string | string[] | undefined>;

/** Period from the URL plus its data; `query` keeps the period when moving between reports. */
export async function reportPageData(sp: SearchParams) {
  await assertAdmin(); // pages must not rely on the admin layout alone
  const { preset, period } = periodFromParams(sp, businessDateWIB(new Date()));
  const outlet = await getCurrentOutlet();
  const data = await loadReportData(outlet.id, period);
  const query: Record<string, string> = preset ? { preset } : { from: period.from, to: period.to };
  return { preset, period, data, query };
}

/**
 * Like reportPageData, but caches what `compute` returns (a small, plain-JSON
 * summary) instead of handing out the raw rows. `name` must identify `compute`
 * and every option it depends on. Display only, never used for a sale.
 */
export async function reportView<T>(sp: SearchParams, name: string, compute: (d: ReportData) => T) {
  await assertAdmin(); // pages must not rely on the admin layout alone
  const { preset, period } = periodFromParams(sp, businessDateWIB(new Date()));
  const outlet = await getCurrentOutlet();
  const view = await cachedRead(`report:${name}:${outlet.id}:${period.from}:${period.to}`, async () => compute(await loadReportData(outlet.id, period, primaryOnly)))();
  const query: Record<string, string> = preset ? { preset } : { from: period.from, to: period.to };
  return { preset, period, view, query };
}
