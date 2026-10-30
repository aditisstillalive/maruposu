'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Notice from '@/components/admin/Notice';
import DenominationInput from '@/components/pos/app/DenominationInput';
import { send } from '@/lib/api-client';
import { emptyDenominations, type Denominations } from '@/lib/pos/shift';

export default function CloseForm({ shiftId, openBills }: { shiftId: string; openBills: number }) {
  const router = useRouter();
  const [denominations, setDenominations] = useState<Denominations>(emptyDenominations);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const close = async () => {
    if (!confirm('Tutup shift ini dari admin?')) return;
    setSaving(true);
    setError('');
    try {
      await send(`/api/admin/shifts/${shiftId}/close`, 'POST', { denominations, reason });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menutup');
      setSaving(false);
    }
  };

  return (
    <Card className="mt-6 max-w-xl">
      <CardHeader><CardTitle>Tutup dari admin</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Notice ok={false}>
          Pastikan tablet sudah tersinkron. Transaksi tablet yang belum terkirim akan ditolak setelah shift ditutup.
          {openBills > 0 && ` ${openBills} open bill akan dibatalkan dengan alasan di bawah.`}
        </Notice>
        <DenominationInput value={denominations} onChange={setDenominations} />
        <label className="block space-y-1">
          <span className="text-sm font-medium">Alasan</span>
          <input aria-label="Alasan" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="mis. tablet rusak, kasir lupa tutup"
            className="h-9 w-full rounded-lg border px-3 text-sm" />
        </label>
        {error && <Notice ok={false}>{error}</Notice>}
        <Button onClick={close} disabled={saving || !reason.trim()}>{saving ? 'Menutup...' : 'Tutup shift'}</Button>
      </CardContent>
    </Card>
  );
}
