'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';
import { formatRupiah } from '@/lib/money';

type Option = { name: string; price_delta: number; is_default: boolean; is_active: boolean };
type Kind = 'variant' | 'addon';
type Draft = { name: string; kind: Kind; required: boolean; max_select: number; options: Option[] };
type Group = Draft & { id: string; product_count: number };

const newOption = (): Option => ({ name: '', price_delta: 0, is_default: false, is_active: true });

export default function OptionGroupManager({ groups, children }: { groups: Group[]; children: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; data: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const open = (g?: Group) => {
    setError('');
    setEditing(
      g
        ? { id: g.id, data: { name: g.name, kind: g.kind, required: g.required, max_select: g.max_select, options: g.options } }
        : { id: null, data: { name: '', kind: 'variant', required: true, max_select: 1, options: [newOption(), newOption()] } }
    );
  };
  const set = (patch: Partial<Draft>) => setEditing(e => (e ? { ...e, data: { ...e.data, ...patch } } : e));
  const setOption = (i: number, patch: Partial<Option>) =>
    setEditing(e => {
      if (!e) return e;
      const options = e.data.options.map((o, j) => {
        if (j === i) return { ...o, ...patch };
        // A variant group has a single default
        if (patch.is_default && e.data.kind === 'variant') return { ...o, is_default: false };
        return o;
      });
      return { ...e, data: { ...e.data, options } };
    });

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const body = { ...editing.data, options: editing.data.options.filter(o => o.name.trim()) };
      if (editing.id) await send(`/api/admin/option-groups/${editing.id}`, 'PATCH', body);
      else await send('/api/admin/option-groups', 'POST', body);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const remove = (g: Group) => {
    const warn = g.product_count ? ` Grup ini dipakai ${g.product_count} produk.` : '';
    if (!confirm(`Hapus grup "${g.name}"?${warn}`)) return;
    void send(`/api/admin/option-groups/${g.id}`, 'DELETE').then(() => router.refresh(), e => alert(e.message));
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {children}
        <Button onClick={() => open()}><Plus /> Tambah grup</Button>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          Belum ada grup. Contoh: &quot;Suhu&quot; (Hot/Ice), &quot;Level Gula&quot;, &quot;Extra&quot;.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map(g => (
            <Card key={g.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle>{g.name}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {g.kind === 'variant' ? 'Varian · pilih 1' : `Add-on · maks ${g.max_select}`}
                    {g.required ? ' · wajib' : ' · opsional'} · {g.product_count} produk
                  </p>
                </div>
                <div className="flex">
                  <Button size="icon-sm" variant="ghost" aria-label={`Ubah ${g.name}`} onClick={() => open(g)}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Hapus ${g.name}`} className="text-destructive hover:bg-destructive/10" onClick={() => remove(g)}><Trash2 /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {g.options.map((o, i) => (
                    <li key={i} className={`flex justify-between ${o.is_active ? '' : 'text-muted-foreground line-through'}`}>
                      <span>{o.name}{o.is_default && <span className="ml-2 text-xs text-muted-foreground">(default)</span>}</span>
                      <span className="tabular-nums text-muted-foreground">{o.price_delta ? `+${formatRupiah(o.price_delta)}` : '-'}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? 'Ubah grup' : 'Tambah grup'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="g-name">Nama grup</Label>
                <Input id="g-name" value={editing.data.name} onChange={e => set({ name: e.target.value })} placeholder="Suhu / Level Gula / Extra" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['variant', 'addon'] as const).map(kind => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => set({ kind, required: kind === 'variant', max_select: kind === 'variant' ? 1 : Math.max(editing.data.max_select, 3) })}
                    className={`rounded-lg border p-3 text-left text-sm ${editing.data.kind === kind ? 'border-brand-strong bg-brand-soft' : 'hover:bg-muted'}`}
                  >
                    <span className="block font-medium">{kind === 'variant' ? 'Varian' : 'Add-on'}</span>
                    <span className="block text-xs text-muted-foreground">{kind === 'variant' ? 'Pilih tepat satu' : 'Boleh pilih beberapa'}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <span className="text-sm font-medium">Wajib dipilih</span>
                  <Switch checked={editing.data.required} onCheckedChange={required => set({ required })} />
                </label>
                {editing.data.kind === 'addon' && (
                  <div className="space-y-1">
                    <Label htmlFor="g-max" className="text-xs">Maksimal pilihan</Label>
                    <Input id="g-max" type="number" min={1} max={20} value={editing.data.max_select} onChange={e => set({ max_select: e.target.valueAsNumber || 1 })} />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Pilihan</Label>
                {editing.data.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input className="flex-1" value={o.name} onChange={e => setOption(i, { name: e.target.value })} placeholder={editing.data.kind === 'variant' ? 'Ice' : 'Extra shot'} aria-label="Nama pilihan" />
                    <Input className="w-28" type="number" min={0} step={500} value={o.price_delta} onChange={e => setOption(i, { price_delta: e.target.valueAsNumber || 0 })} aria-label="Harga tambahan" />
                    <label className="flex items-center gap-1 text-xs" title="Terpilih otomatis">
                      <input type="checkbox" checked={o.is_default} onChange={e => setOption(i, { is_default: e.target.checked })} /> default
                    </label>
                    <Button size="icon-sm" variant="ghost" aria-label="Hapus pilihan" onClick={() => set({ options: editing.data.options.filter((_, j) => j !== i) })}><X /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => set({ options: [...editing.data.options, newOption()] })}><Plus /> Pilihan</Button>
                <p className="text-xs text-muted-foreground">Angka di kanan = harga tambahan (Rp). Isi 0 kalau tidak menambah harga.</p>
              </div>
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
