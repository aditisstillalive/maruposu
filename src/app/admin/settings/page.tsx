import { getCurrentOutlet } from '@/lib/outlet';
import { getReplicaStatus } from '@/lib/replica-sync';
import { ReplicaStatus } from '@/components/admin/replica-status';
import PageHeader from '@/components/admin/PageHeader';
import SettingsForm from './settings-form';
import type { ReceiptLogo } from '@/lib/pos/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pengaturan | Admin' };

export default async function SettingsPage() {
  const [{ setting }, replica] = await Promise.all([getCurrentOutlet(), getReplicaStatus()]);
  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Pengaturan" description="Identitas kafe, pajak, dan struk." />
      <SettingsForm
        initial={{
          cafe_name: setting.cafe_name,
          tax_name: setting.tax_name,
          tax_rate: setting.tax_rate_bp / 100,
          tax_inclusive: setting.tax_inclusive,
          receipt_header: setting.receipt_header ?? '',
          receipt_footer: setting.receipt_footer ?? '',
          receipt_logo: (setting.receipt_logo as ReceiptLogo | null) ?? null,
        }}
      />
      {replica.configured && (
        <ReplicaStatus
          inSync={replica.inSync}
          lastSyncedAt={replica.lastSyncedAt?.toISOString() ?? null}
          lastError={replica.lastError}
        />
      )}
    </div>
  );
}
