'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function HandledButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mark = async () => {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/admin/vouchers/redemptions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handled: true }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError('Gagal menyimpan, coba lagi');
    router.refresh();
  };
  return (
    <span className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={busy} onClick={mark} aria-label={`Sudah ditangani ${code}`}>Sudah ditangani</Button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
