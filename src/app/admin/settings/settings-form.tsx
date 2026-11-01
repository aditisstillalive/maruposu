'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';
import { formatRupiah } from '@/lib/money';
import ReceiptLogoInput from '@/components/admin/ReceiptLogoInput';
import type { ReceiptLogo } from '@/lib/pos/types';

type Form = { cafe_name: string; tax_name: string; tax_rate: number; tax_inclusive: boolean; receipt_header: string; receipt_footer: string; receipt_logo: ReceiptLogo | null };

const SAMPLE_PRICE = 25000;

export default function SettingsForm({ initial }: { initial: Form }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  const rate = Number.isFinite(form.tax_rate) ? form.tax_rate : 0;
  const sampleTax = form.tax_inclusive
    ? Math.round((SAMPLE_PRICE * rate) / (100 + rate))
    : Math.round((SAMPLE_PRICE * rate) / 100);
  const sampleTotal = form.tax_inclusive ? SAMPLE_PRICE : SAMPLE_PRICE + sampleTax;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await send('/api/admin/settings', 'PUT', form);
      setMsg({ ok: true, text: 'Tersimpan' });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gagal menyimpan' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Kafe & struk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cafe_name">Nama kafe</Label>
            <Input id="cafe_name" value={form.cafe_name} onChange={e => set({ cafe_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Logo struk</Label>
            <ReceiptLogoInput value={form.receipt_logo} onChange={receipt_logo => set({ receipt_logo })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt_header">Pesan atas struk</Label>
            <Textarea
              id="receipt_header"
              value={form.receipt_header}
              onChange={e => set({ receipt_header: e.target.value })}
              placeholder={'mis. Wifi: Maraca\nPassword: bacabuku'}
            />
            <p className="text-xs text-muted-foreground">Di bawah nama dan alamat kafe. Baris baru tetap jadi baris baru.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt_footer">Catatan kaki struk</Label>
            <Textarea
              id="receipt_footer"
              value={form.receipt_footer}
              onChange={e => set({ receipt_footer: e.target.value })}
              placeholder="Terima kasih! IG @maracacoffee"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pajak</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tax_name">Nama pajak</Label>
              <Input id="tax_name" value={form.tax_name} onChange={e => set({ tax_name: e.target.value })} placeholder="PB1 / PPN" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_rate">Tarif (%)</Label>
              <Input
                id="tax_rate"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.5}
                value={Number.isFinite(form.tax_rate) ? form.tax_rate : ''}
                onChange={e => set({ tax_rate: e.target.valueAsNumber })}
              />
            </div>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="block font-medium">Harga menu sudah termasuk pajak</span>
              <span className="block text-sm text-neutral-500">Kalau mati, pajak ditambahkan di atas subtotal.</span>
            </span>
            <Switch checked={form.tax_inclusive} onCheckedChange={tax_inclusive => set({ tax_inclusive })} />
          </label>
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Contoh: menu {formatRupiah(SAMPLE_PRICE)} → {form.tax_name || 'Pajak'} {formatRupiah(sampleTax)}, total dibayar{' '}
            <span className="font-medium text-foreground">{formatRupiah(sampleTotal)}</span>.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 xl:col-span-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
      </div>
    </div>
  );
}
