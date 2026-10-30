import PageHeader from '@/components/admin/PageHeader';
import PeriodPicker from './PeriodPicker';
import ReportNav from './ReportNav';
import type { Preset } from '@/lib/reports/period';
import type { Period } from '@/lib/reports/types';
import type { ReportName } from '@/lib/reports/tables';

/** Header, period picker and tabs shared by every report page. */
export default function ReportShell(props: {
  title: string; description: string; basePath: string; preset: Preset | null; period: Period; query: Record<string, string>;
  csv?: ReportName; extra?: Record<string, string>; children: React.ReactNode;
}) {
  const range = props.period.from === props.period.to ? props.period.from : `${props.period.from} – ${props.period.to}`;
  return (
    <div className="p-4 md:p-8">
      <PageHeader title={props.title} description={`${props.description} Hari bisnis ${range}.`} />
      <ReportNav query={props.query} csv={props.csv} csvQuery={props.extra} />
      <PeriodPicker basePath={props.basePath} preset={props.preset} period={props.period} extra={props.extra} />
      {props.children}
    </div>
  );
}
