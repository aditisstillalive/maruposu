'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';
import { WASTE_LABEL } from '@/lib/pos/waste-labels';

type Named = { id: string; name: string; unit?: string };
const select = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm';

export default function WasteForm({ ingredients, products }: { ingredients: Named[]; products: Named[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<'ingredient' | 'product'>('ingredient');
  const [target, setTarget] = useState('');
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState('tumpah');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const list = kind === 'ingredient' ? ingredients : products;
  const unit = kind === 'ingredient' ? ingredients.find(i => i.id === target)?.unit ?? '' : 'porsi';

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await send('/api/admin/waste', 'POST', { reason, note, lines: [{ [kind === 'ingredient' ? 'ingredient_id' : 'product_id']: target, qty }] });
      setTarget('');
      setQty(null);
      setNote('');
      setMsg({ ok: true, text: 'Waste tercatat' });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gagal menyimpan' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Jenis" className={select} value={kind} onChange={e => { setKind(e.target.value as typeof kind); setTarget(''); }}>
            <option value="ingredient">Bahan</option><option value="product">Produk</option>
          </select>
          <select aria-label="Yang terbuang" className={`${select} min-w-44`} value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Pilih {kind === 'ingredient' ? 'bahan' : 'produk'}</option>
            {list.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <Input aria-label="Jumlah terbuang" type="number" min={1} className="w-24" value={qty ?? ''} onChange={e => setQty(Number.isNaN(e.target.valueAsNumber) ? null : Math.round(e.target.valueAsNumber))} />
          <span className="text-sm text-muted-foreground">{unit}</span>
          <select aria-label="Alasan" className={select} value={reason} onChange={e => setReason(e.target.value)}>
            {Object.entries(WASTE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <Input aria-label="Catatan waste" placeholder="Catatan (opsional)" value={note} onChange={e => setNote(e.target.value)} />
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving || !target || !qty}>{saving ? 'Menyimpan...' : 'Catat waste'}</Button>
          {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
        </div>
      </CardContent>
    </Card>
  );
}
