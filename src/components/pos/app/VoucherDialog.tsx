'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/money';
import { tillVoucher, type TillVouchers } from '@/lib/vouchers/till';

/** A printed voucher code typed by the cashier, checked on the tablet (works offline). */
export default function VoucherDialog({ vouchers, subtotal, onPick, onClose }: {
  vouchers: TillVouchers | undefined;
  /** the bill's subtotal after the promo */
  subtotal: number;
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const use = () => {
    const v = tillVoucher(vouchers, input, subtotal, new Date());
    if (!v.check.ok) return setError(v.check.reason);
    onPick(v.code!);
  };
  const preview = input.trim() ? tillVoucher(vouchers, input, subtotal, new Date()) : null;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Voucher</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); use(); }}>
          <input aria-label="Kode voucher" value={input} autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false}
            onChange={e => { setInput(e.target.value.toUpperCase()); setError(''); }} placeholder="MRC-XXXX-XXXX"
            className="h-12 w-full rounded-xl border px-3 font-mono text-lg uppercase tracking-widest outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
          {preview?.check.ok && preview.rule && (
            <p className="text-sm text-green-800">{preview.rule.batch_name} · potongan <span className="font-semibold">{formatRupiah(preview.check.discount)}</span></p>
          )}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button type="submit" className="h-11 w-full" disabled={!input.trim()}>Pakai voucher</Button>
          <p className="text-xs text-gray-500">Kode dari voucher cetak Toko Iboek. Satu kode hanya bisa dipakai sekali.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
