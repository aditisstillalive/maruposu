'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';
import { formatRupiah } from '@/lib/money';
import { toBaseQty } from '@/lib/pos/inventory';

type Ingredient = { id: string; name: string; unit: string; purchase_unit: string | null; purchase_size: number | null };
type Line = { ingredient_id: string; amount: number | null; unit: 'base' | 'purchase'; total_cost: number | null };

const newLine = (): Line => ({ ingredient_id: '', amount: null, unit: 'purchase', total_cost: null });
const num = (v: number) => (Number.isNaN(v) ? null : v);
const select = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm';

export default function PurchaseForm({ ingredients }: { ingredients: Ingredient[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const filled = lines.filter(l => l.ingredient_id && l.amount && l.total_cost !== null);
  const total = filled.reduce((s, l) => s + (l.total_cost ?? 0), 0);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await send('/api/admin/purchases', 'POST', { supplier, note, lines: filled });
      setLines([newLine()]);
      setSupplier('');
      setNote('');
      setMsg({ ok: true, text: 'Stok masuk tersimpan' });
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
        {lines.map((l, i) => {
          const ing = ingredients.find(x => x.id === l.ingredient_id);
          const usePurchase = l.unit === 'purchase' && !!ing?.purchase_unit;
          const qty = ing && l.amount ? toBaseQty(l.amount, usePurchase ? 'purchase' : 'base', ing.purchase_size) : 0;
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select aria-label="Bahan" className={`${select} min-w-44`} value={l.ingredient_id} onChange={e => setLine(i, { ingredient_id: e.target.value })}>
                <option value="">Pilih bahan</option>
                {ingredients.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <Input aria-label="Jumlah" type="number" min={0} step="any" className="w-24" value={l.amount ?? ''} onChange={e => setLine(i, { amount: num(e.target.valueAsNumber) })} />
              <select aria-label="Satuan" className={select} value={usePurchase ? 'purchase' : 'base'} onChange={e => setLine(i, { unit: e.target.value as Line['unit'] })}>
                {ing?.purchase_unit && <option value="purchase">{ing.purchase_unit}</option>}
                <option value="base">{ing?.unit ?? 'satuan'}</option>
              </select>
              <Input aria-label="Total harga" type="number" min={0} step={500} className="w-36" placeholder="Total Rp" value={l.total_cost ?? ''} onChange={e => setLine(i, { total_cost: num(e.target.valueAsNumber) })} />
              <span className="text-xs text-muted-foreground tabular-nums">
                {qty ? `= ${qty.toLocaleString('id-ID')} ${ing!.unit}` : ''}
                {qty && l.total_cost ? ` · ${formatRupiah(Math.round((l.total_cost / qty) * 100) / 100)}/${ing!.unit}` : ''}
              </span>
              {lines.length > 1 && <Button size="icon-sm" variant="ghost" aria-label="Hapus baris" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><X /></Button>}
            </div>
          );
        })}
        <Button size="sm" variant="outline" onClick={() => setLines(ls => [...ls, newLine()])}><Plus /> Baris</Button>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label="Pemasok" placeholder="Pemasok (opsional)" value={supplier} onChange={e => setSupplier(e.target.value)} />
          <Input aria-label="Catatan" placeholder="Catatan (opsional)" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving || !filled.length}>{saving ? 'Menyimpan...' : `Simpan stok masuk · ${formatRupiah(total)}`}</Button>
          {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
        </div>
      </CardContent>
    </Card>
  );
}
