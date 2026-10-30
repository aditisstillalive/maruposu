'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';
import { formatRupiah } from '@/lib/money';
import { formatStock, toBaseQty } from '@/lib/pos/inventory';

type Ingredient = { id: string; name: string; unit: string; purchase_unit: string | null; purchase_size: number | null; stock: number; avg_cost_milli: number };
type Entry = { amount: number | null; unit: 'base' | 'purchase' };

export default function OpnameForm({ ingredients }: { ingredients: Ingredient[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const counted = (i: Ingredient) => {
    const e = entries[i.id];
    return e && e.amount !== null ? toBaseQty(e.amount, e.unit, i.purchase_size) : null;
  };
  const filled = ingredients.filter(i => counted(i) !== null);
  const diffValue = filled.reduce((s, i) => s + ((counted(i)! - i.stock) * i.avg_cost_milli) / 1000, 0);
  const set = (id: string, patch: Partial<Entry>) =>
    setEntries(es => ({ ...es, [id]: { ...(es[id] ?? { amount: null, unit: 'base' }), ...patch } }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await send('/api/admin/opname', 'POST', { note, lines: filled.map(i => ({ ingredient_id: i.id, counted: counted(i) })) });
      setEntries({});
      setNote('');
      setMsg({ ok: true, text: 'Opname tersimpan' });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gagal menyimpan' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3">Bahan</th><th className="p-3">Stok sistem</th><th className="p-3">Hitung fisik</th><th className="p-3 text-right">Selisih</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map(i => {
              const c = counted(i);
              const diff = c === null ? null : c - i.stock;
              return (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{i.name}</td>
                  <td className="p-3 tabular-nums text-muted-foreground">{formatStock(i.stock, i)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Input aria-label={`Hitung ${i.name}`} type="number" min={0} step="any" className="w-28" value={entries[i.id]?.amount ?? ''}
                        onChange={e => set(i.id, { amount: Number.isNaN(e.target.valueAsNumber) ? null : e.target.valueAsNumber })} />
                      {i.purchase_unit ? (
                        <select aria-label={`Satuan ${i.name}`} value={entries[i.id]?.unit ?? 'base'} onChange={e => set(i.id, { unit: e.target.value as Entry['unit'] })}
                          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
                          <option value="base">{i.unit}</option><option value="purchase">{i.purchase_unit}</option>
                        </select>
                      ) : <span className="text-muted-foreground">{i.unit}</span>}
                    </div>
                  </td>
                  <td className={`p-3 text-right tabular-nums ${diff ? (diff < 0 ? 'text-red-700' : 'text-green-700') : ''}`}>
                    {diff === null ? '' : `${diff > 0 ? '+' : ''}${diff.toLocaleString('id-ID')} ${i.unit}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Input aria-label="Catatan opname" placeholder="Catatan (opsional), mis. opname mingguan" value={note} onChange={e => setNote(e.target.value)} />
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || !filled.length}>
          {saving ? 'Menyimpan...' : `Simpan opname · ${filled.length} bahan · selisih ${formatRupiah(Math.round(diffValue))}`}
        </Button>
        {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
      </div>
    </div>
  );
}
