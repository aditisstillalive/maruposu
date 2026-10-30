'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';
import { formatRupiah } from '@/lib/money';
import { formatStock, isLow, unitPriceLabel } from '@/lib/pos/inventory';

type Unit = 'g' | 'ml' | 'pcs';
type Ingredient = {
  id: string; name: string; unit: Unit; purchase_unit: string | null; purchase_size: number | null;
  stock: number; avg_cost_milli: number; min_stock: number | null; is_active: boolean;
};
type Draft = { name: string; unit: Unit; purchase_unit: string; purchase_size: number | null; min_stock: number | null; is_active: boolean };

const num = (v: number) => (Number.isNaN(v) ? null : v);
const select = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm';

export default function IngredientManager({ ingredients, children }: { ingredients: Ingredient[]; children: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; data: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<Draft>) => setEditing(e => (e ? { ...e, data: { ...e.data, ...patch } } : e));

  const open = (i?: Ingredient) => {
    setError('');
    setEditing(i
      ? { id: i.id, data: { name: i.name, unit: i.unit, purchase_unit: i.purchase_unit ?? '', purchase_size: i.purchase_size, min_stock: i.min_stock, is_active: i.is_active } }
      : { id: null, data: { name: '', unit: 'g', purchase_unit: '', purchase_size: null, min_stock: null, is_active: true } });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      if (editing.id) await send(`/api/admin/ingredients/${editing.id}`, 'PATCH', editing.data);
      else await send('/api/admin/ingredients', 'POST', editing.data);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {children}
        <Button onClick={() => open()}><Plus /> Tambah bahan</Button>
      </div>
      {ingredients.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Belum ada bahan. Contoh: Biji kopi (g), Susu UHT (ml, karton 12.000 ml), Cup 16oz (pcs).</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3">Bahan</th>
                <th className="p-3">Stok</th>
                <th className="p-3 text-right">Minimum</th>
                <th className="p-3 text-right">Harga rata-rata</th>
                <th className="p-3 text-right">Nilai stok</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {ingredients.map(i => {
                const low = isLow(i.stock, i.min_stock);
                return (
                  <tr key={i.id} className={`border-b last:border-0 hover:bg-muted/50 ${i.is_active ? '' : 'opacity-50'}`}>
                    <td className="p-3 font-medium">
                      <Link href={`/admin/inventory/${i.id}`} className="hover:underline">{i.name}</Link>
                      {i.stock < 0 ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Minus</span>
                        : low && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Menipis</span>}
                    </td>
                    <td className="p-3 tabular-nums">{formatStock(i.stock, i)}</td>
                    <td className="p-3 text-right tabular-nums">{i.min_stock === null ? '-' : `${i.min_stock.toLocaleString('id-ID')} ${i.unit}`}</td>
                    <td className="p-3 text-right tabular-nums">{i.avg_cost_milli ? unitPriceLabel(i.avg_cost_milli, i) : '-'}</td>
                    <td className="p-3 text-right tabular-nums">{formatRupiah(Math.round((Math.max(i.stock, 0) * i.avg_cost_milli) / 1000))}</td>
                    <td className="p-3 text-right"><Button size="icon-sm" variant="ghost" aria-label={`Ubah ${i.name}`} onClick={() => open(i)}><Pencil /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? 'Ubah bahan' : 'Tambah bahan'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ing-name">Nama</Label>
                <Input id="ing-name" value={editing.data.name} onChange={e => set({ name: e.target.value })} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ing-unit">Satuan pakai</Label>
                  <select id="ing-unit" className={select} value={editing.data.unit} onChange={e => set({ unit: e.target.value as Unit })}>
                    <option value="g">gram (g)</option><option value="ml">mililiter (ml)</option><option value="pcs">pcs</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ing-min">Stok minimum</Label>
                  <Input id="ing-min" type="number" min={0} value={editing.data.min_stock ?? ''} onChange={e => set({ min_stock: num(e.target.valueAsNumber) })} placeholder={editing.data.unit} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ing-pu">Satuan beli (opsional)</Label>
                  <Input id="ing-pu" value={editing.data.purchase_unit} onChange={e => set({ purchase_unit: e.target.value })} placeholder="karton / pack" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ing-ps">Isi per satuan beli</Label>
                  <Input id="ing-ps" type="number" min={1} disabled={!editing.data.purchase_unit.trim()} value={editing.data.purchase_size ?? ''}
                    onChange={e => set({ purchase_size: num(e.target.valueAsNumber) })} placeholder={editing.data.unit} />
                </div>
              </div>
              <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <span className="font-medium">Aktif</span>
                <Switch checked={editing.data.is_active} onCheckedChange={is_active => set({ is_active })} />
              </label>
              {error && <Notice ok={false}>{error}</Notice>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
            <Button onClick={save} disabled={saving || !editing?.data.name.trim()}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
