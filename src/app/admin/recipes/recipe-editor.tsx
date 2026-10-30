'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';
import { formatRupiah } from '@/lib/money';
import { costOf } from '@/lib/pos/inventory';

type Line = { ingredient_id: string; qty: number };
type DraftLine = { ingredient_id: string; qty: number | null };
type Item = { id: string; name: string; price: number; lines: Line[] };
type Ingredient = { id: string; name: string; unit: string; avg_cost_milli: number; is_active: boolean };

export default function RecipeEditor({ categories, groups, ingredients }: {
  categories: { id: string; name: string; products: Item[] }[];
  groups: { id: string; name: string; options: Item[] }[];
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const avg = Object.fromEntries(ingredients.map(i => [i.id, i.avg_cost_milli]));
  const cost = (lines: Line[]) => costOf(new Map(lines.filter(l => l.ingredient_id).map(l => [l.ingredient_id, l.qty || 0])), avg);
  const [editing, setEditing] = useState<{ kind: 'product' | 'option'; item: Item; lines: DraftLine[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const open = (kind: 'product' | 'option', item: Item) => {
    setError('');
    setEditing({ kind, item, lines: item.lines.length ? item.lines : [{ ingredient_id: '', qty: null } as DraftLine] });
  };
  const setLine = (i: number, patch: Partial<{ ingredient_id: string; qty: number | null }>) =>
    setEditing(e => (e ? { ...e, lines: e.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : e));

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const lines = editing.lines.filter(l => l.ingredient_id && l.qty);
      await send('/api/admin/recipes', 'PUT', { [editing.kind === 'product' ? 'product_id' : 'option_id']: editing.item.id, lines });
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const margin = (price: number, hpp: number) => (price > 0 ? Math.round(((price - hpp) / price) * 100) : 0);
  const draftCost = editing ? cost(editing.lines.map(l => ({ ingredient_id: l.ingredient_id, qty: l.qty ?? 0 }))) : 0;

  return (
    <>
      {ingredients.length === 0 && <Notice ok={false}>Belum ada bahan. Tambahkan dulu di Inventaris.</Notice>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Produk</CardTitle></CardHeader>
          <CardContent>
            {categories.map(c => (
              <div key={c.id} className="mb-4">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{c.name}</p>
                <ul className="divide-y rounded-lg border">
                  {c.products.map(p => {
                    const hpp = cost(p.lines);
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => open('product', p)} aria-label={`Resep ${p.name}`}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50">
                          <span className="flex-1 font-medium">{p.name}</span>
                          {p.lines.length === 0 ? <span className="text-xs text-amber-700">Belum ada resep</span> : (
                            <span className="text-right tabular-nums">
                              <span className="block">HPP {formatRupiah(hpp)}</span>
                              <span className="block text-xs text-muted-foreground">harga {formatRupiah(p.price)} · margin {margin(p.price, hpp)}%</span>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pilihan varian & add-on</CardTitle></CardHeader>
          <CardContent>
            {groups.map(g => (
              <div key={g.id} className="mb-4">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{g.name}</p>
                <ul className="divide-y rounded-lg border">
                  {g.options.map(o => (
                    <li key={o.id}>
                      <button type="button" onClick={() => open('option', o)} aria-label={`Resep pilihan ${o.name}`}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50">
                        <span className="flex-1">{o.name}</span>
                        <span className="text-right text-xs tabular-nums text-muted-foreground">
                          {o.lines.length ? `+HPP ${formatRupiah(cost(o.lines))}` : 'tanpa bahan tambahan'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editing !== null} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Resep {editing?.kind === 'option' ? 'pilihan ' : ''}{editing?.item.name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              {editing.lines.map((l, i) => {
                const ing = ingredients.find(x => x.id === l.ingredient_id);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select aria-label="Bahan" value={l.ingredient_id} onChange={e => setLine(i, { ingredient_id: e.target.value })}
                      className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm">
                      <option value="">Pilih bahan</option>
                      {ingredients.filter(x => x.is_active || x.id === l.ingredient_id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <Input aria-label="Jumlah per porsi" type="number" min={1} className="w-24" value={l.qty ?? ''}
                      onChange={e => setLine(i, { qty: Number.isNaN(e.target.valueAsNumber) ? null : Math.round(e.target.valueAsNumber) })} />
                    <span className="w-8 text-sm text-muted-foreground">{ing?.unit ?? ''}</span>
                    <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{ing && l.qty ? formatRupiah(cost([{ ingredient_id: ing.id, qty: l.qty }])) : ''}</span>
                    <Button size="icon-sm" variant="ghost" aria-label="Hapus bahan" onClick={() => setEditing(e => (e ? { ...e, lines: e.lines.filter((_, j) => j !== i) } : e))}><X /></Button>
                  </div>
                );
              })}
              <Button size="sm" variant="outline" onClick={() => setEditing(e => (e ? { ...e, lines: [...e.lines, { ingredient_id: '', qty: null }] } : e))}><Plus /> Bahan</Button>
              <p className="text-sm">
                HPP: <span className="font-medium tabular-nums">{formatRupiah(draftCost)}</span>
                {editing.kind === 'product' && editing.item.price > 0 && <span className="text-muted-foreground"> · margin {margin(editing.item.price, draftCost)}%</span>}
              </p>
              {error && <Notice ok={false}>{error}</Notice>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan resep'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
