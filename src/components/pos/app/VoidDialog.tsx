'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function VoidDialog({ code, onConfirm, onClose }: { code: string; onConfirm: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(reason);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membatalkan');
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Batalkan bill {code}?</DialogTitle></DialogHeader>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Alasan</span>
          <input autoFocus value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="mis. customer batal pesan"
            className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose}>Kembali</Button>
          <Button variant="destructive" className="h-11" disabled={!reason.trim() || busy} onClick={submit}>Batalkan bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
