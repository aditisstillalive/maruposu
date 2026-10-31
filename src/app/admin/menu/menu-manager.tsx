'use client';

import { useState } from 'react';
import R2Photo from '@/components/R2Photo';
import { useRouter } from 'next/navigation';
import { Coffee, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Notice from '@/components/admin/Notice';
import PhotoInput from '@/components/admin/PhotoInput';
import { send } from '@/lib/api-client';
import { formatRupiah } from '@/lib/money';

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  photo_url: string | null;
  is_active: boolean;
  is_sold_out: boolean;
  sort_order: number;
  category_id: string;
  option_group_ids: string[];
};
type Category = { id: string; name: string; sort_order: number; is_active: boolean; products: Product[] };
type Group = { id: string; name: string; kind: string };

type CategoryDraft = { name: string; sort_order: number; is_active: boolean };
type ProductDraft = Omit<Product, 'id' | 'price'> & { price: number | null };

const selectClass =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export default function MenuManager({ categories, groups }: { categories: Category[]; groups: Group[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(categories[0]?.id ?? null);
  const selected = categories.find(c => c.id === selectedId) ?? categories[0] ?? null;

  const [catEdit, setCatEdit] = useState<{ id: string | null; data: CategoryDraft } | null>(null);
  const [prodEdit, setProdEdit] = useState<{ id: string | null; data: ProductDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError('');
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = () =>
    run(async () => {
      if (!catEdit) return;
      if (catEdit.id) await send(`/api/admin/categories/${catEdit.id}`, 'PATCH', catEdit.data);
      else setSelectedId((await send<{ id: string }>('/api/admin/categories', 'POST', catEdit.data)).id);
      setCatEdit(null);
    });

  const deleteCategory = (c: Category) => {
    if (!confirm(`Hapus kategori "${c.name}"?`)) return;
    void send(`/api/admin/categories/${c.id}`, 'DELETE').then(() => router.refresh(), e => alert(e.message));
  };

  const saveProduct = () =>
    run(async () => {
      if (!prodEdit) return;
      const body = { ...prodEdit.data, price: prodEdit.data.price ?? NaN };
      if (prodEdit.id) await send(`/api/admin/products/${prodEdit.id}`, 'PATCH', body);
      else await send('/api/admin/products', 'POST', body);
      setProdEdit(null);
    });

  const deleteProduct = (p: Product) => {
    if (!confirm(`Hapus produk "${p.name}"?`)) return;
    void send(`/api/admin/products/${p.id}`, 'DELETE').then(() => router.refresh(), e => alert(e.message));
  };

  const toggleSoldOut = (p: Product) =>
    void send(`/api/admin/products/${p.id}`, 'PATCH', { ...p, is_sold_out: !p.is_sold_out }).then(() => router.refresh(), e => alert(e.message));

  const newProduct = (): ProductDraft => ({
    name: '', description: null, price: null, photo_url: null, is_active: true, is_sold_out: false,
    sort_order: 0, category_id: selected?.id ?? '', option_group_ids: [],
  });

  const setProd = (patch: Partial<ProductDraft>) => setProdEdit(p => (p ? { ...p, data: { ...p.data, ...patch } } : p));
  const setCat = (patch: Partial<CategoryDraft>) => setCatEdit(c => (c ? { ...c, data: { ...c.data, ...patch } } : c));

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      {/* Categories */}
      <aside className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Kategori</h2>
          <Button size="sm" variant="outline" onClick={() => { setError(''); setCatEdit({ id: null, data: { name: '', sort_order: categories.length, is_active: true } }); }}>
            <Plus /> Kategori
          </Button>
        </div>
        {categories.length === 0 && <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-muted-foreground">Mulai dengan menambah kategori, mis. Kopi, Non-Kopi, Makanan.</p>}
        <nav className="space-y-0.5">
          {categories.map(c => (
            <div key={c.id} className={`group flex items-center rounded-lg ${selected?.id === c.id ? 'bg-brand-soft text-black' : 'hover:bg-gray-100'}`}>
              <button type="button" onClick={() => setSelectedId(c.id)} className={`flex-1 px-2 py-2 text-left text-sm font-medium ${c.is_active ? '' : 'opacity-50'}`}>
                {c.name} <span className="text-xs text-muted-foreground tabular-nums">({c.products.length})</span>
              </button>
              <button type="button" aria-label={`Ubah ${c.name}`} onClick={() => { setError(''); setCatEdit({ id: c.id, data: { name: c.name, sort_order: c.sort_order, is_active: c.is_active } }); }} className="p-2 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" aria-label={`Hapus ${c.name}`} onClick={() => deleteCategory(c)} className="p-2 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </nav>
      </aside>

      {/* Products */}
      <section className="min-w-0">
        {selected && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-medium">{selected.name}</h2>
              <Button onClick={() => { setError(''); setProdEdit({ id: null, data: newProduct() }); }}><Plus /> Produk</Button>
            </div>
            {selected.products.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Belum ada produk di kategori ini.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left">Produk</th>
                      <th className="p-3 text-right">Harga</th>
                      <th className="p-3 text-left">Varian & add-on</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.products.map(p => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                              {p.photo_url ? <R2Photo src={p.photo_url} sizes="40px" /> : <Coffee className="h-4 w-4 text-muted-foreground" />}
                            </span>
                            <span className="font-medium">{p.name}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums">{formatRupiah(p.price)}</td>
                        <td className="p-3 text-muted-foreground">
                          {p.option_group_ids.map(id => groups.find(g => g.id === id)?.name).filter(Boolean).join(', ') || '-'}
                        </td>
                        <td className="p-3">
                          {!p.is_active ? (
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">Nonaktif</span>
                          ) : (
                            <button type="button" onClick={() => toggleSoldOut(p)} title="Tap untuk ubah" className={`rounded-full px-2 py-1 text-xs font-medium ${p.is_sold_out ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                              {p.is_sold_out ? 'Habis' : 'Tersedia'}
                            </button>
                          )}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <Button size="icon-sm" variant="ghost" aria-label={`Ubah ${p.name}`} onClick={() => { setError(''); setProdEdit({ id: p.id, data: { ...p } }); }}><Pencil /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label={`Hapus ${p.name}`} className="text-destructive hover:bg-destructive/10" onClick={() => deleteProduct(p)}><Trash2 /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* Category dialog */}
      <Dialog open={catEdit !== null} onOpenChange={o => !o && setCatEdit(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{catEdit?.id ? 'Ubah kategori' : 'Tambah kategori'}</DialogTitle></DialogHeader>
          {catEdit && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Nama</Label>
                <Input id="cat-name" value={catEdit.data.name} onChange={e => setCat({ name: e.target.value })} autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-order">Urutan</Label>
                <Input id="cat-order" type="number" value={catEdit.data.sort_order} onChange={e => setCat({ sort_order: e.target.valueAsNumber || 0 })} />
              </div>
              <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <span className="font-medium">Tampil di POS</span>
                <Switch checked={catEdit.data.is_active} onCheckedChange={is_active => setCat({ is_active })} />
              </label>
              {error && <Notice ok={false}>{error}</Notice>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatEdit(null)}>Batal</Button>
            <Button onClick={saveCategory} disabled={saving || !catEdit?.data.name.trim()}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product dialog */}
      <Dialog open={prodEdit !== null} onOpenChange={o => !o && setProdEdit(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{prodEdit?.id ? 'Ubah produk' : 'Tambah produk'}</DialogTitle></DialogHeader>
          {prodEdit && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="p-name">Nama</Label>
                  <Input id="p-name" value={prodEdit.data.name} onChange={e => setProd({ name: e.target.value })} autoFocus />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-cat">Kategori</Label>
                  <select id="p-cat" className={selectClass} value={prodEdit.data.category_id} onChange={e => setProd({ category_id: e.target.value })}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-price">Harga jual (Rp)</Label>
                  <Input id="p-price" type="number" inputMode="numeric" min={0} step={500}
                    value={prodEdit.data.price ?? ''} onChange={e => setProd({ price: Number.isNaN(e.target.valueAsNumber) ? null : e.target.valueAsNumber })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-desc">Deskripsi (opsional)</Label>
                <Textarea id="p-desc" value={prodEdit.data.description ?? ''} onChange={e => setProd({ description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Foto (opsional)</Label>
                <PhotoInput prefix="products" value={prodEdit.data.photo_url} onChange={photo_url => setProd({ photo_url })} />
              </div>
              <div className="space-y-2">
                <Label>Varian & add-on</Label>
                {groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada grup. Buat di menu Varian & Add-on.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {groups.map(g => {
                      const checked = prodEdit.data.option_group_ids.includes(g.id);
                      return (
                        <label key={g.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={on =>
                              setProd({ option_group_ids: on ? [...prodEdit.data.option_group_ids, g.id] : prodEdit.data.option_group_ids.filter(id => id !== g.id) })
                            }
                          />
                          <span>{g.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{g.kind === 'variant' ? 'Varian' : 'Add-on'}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <span className="text-sm font-medium">Aktif</span>
                  <Switch checked={prodEdit.data.is_active} onCheckedChange={is_active => setProd({ is_active })} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <span className="text-sm font-medium">Habis</span>
                  <Switch checked={prodEdit.data.is_sold_out} onCheckedChange={is_sold_out => setProd({ is_sold_out })} />
                </label>
              </div>
              {error && <Notice ok={false}>{error}</Notice>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProdEdit(null)}>Batal</Button>
            <Button onClick={saveProduct} disabled={saving || !prodEdit?.data.name.trim() || prodEdit?.data.price === null}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
