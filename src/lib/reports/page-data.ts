import { getCurrentOutlet } from '@/lib/outlet';
import { businessDateWIB } from '@/lib/pos/codes';
import { loadReportData } from './load';
import { periodFromParams } from './params';

export type SearchParams = Record<string, string | string[] | undefined>;

/** Period from the URL plus its data; `query` keeps the period when moving between reports. */
export async function reportPageData(sp: SearchParams) {
  const { preset, period } = periodFromParams(sp, businessDateWIB(new Date()));
  const outlet = await getCurrentOutlet();
  const data = await loadReportData(outlet.id, period);
  const query: Record<string, string> = preset ? { preset } : { from: period.from, to: period.to };
  return { preset, period, data, query };
}
