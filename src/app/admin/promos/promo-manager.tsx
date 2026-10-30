'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';
import { fromDateTimeLocal, toDateTimeLocal } from '@/lib/datetime-local';
import { describePromo } from '@/lib/pos/promo-text';
import type { PromoRule } from '@/lib/pos/types';

type Category = { id: string; name: string; products: { id: string; name: string }[] };

type Draft = {
  name: string;
  code: string;
  kind: 'percent' | 'amount';
  value: number | null; // percent as entered (10), or rupiah
  max_discount: number | null;
  scope: 'bill' | 'product' | 'category';
  product_ids: string[];
  category_ids: string[];
  min_spend: number | null;
  starts_at: string; // datetime-local
  ends_at: string;
  days: number[];
  time_start: string;
  time_end: string;
  quota: number | null;
  is_active: boolean;
};

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const emptyDraft = (): Draft => ({
  name: '', code: '', kind: 'percent', value: null, max_discount: null, scope: 'bill', product_ids: [], category_ids: [],
  min_spend: null, starts_at: '', ends_at: '', days: [], time_start: '', time_end: '', quota: null, is_active: true,
});

function toDraft(p: PromoRule): Draft {
  return {
    name: p.name, code: p.code ?? '', kind: p.kind, value: p.kind === 'percent' ? p.value / 100 : p.value,
    max_discount: p.max_discount, scope: p.scope, product_ids: p.product_ids, category_ids: p.category_ids,
    min_spend: p.min_spend || null, starts_at: toDateTimeLocal(p.starts_at), ends_at: toDateTimeLocal(p.ends_at),
    days: p.days, time_start: p.time_start ?? '', time_end: p.time_end ?? '', quota: p.quota, is_active: p.is_active,
  };
}

function status(p: PromoRule, now: Date): { label: string; tone: 'on' | 'off' } {
  if (!p.is_active) return { label: 'Nonaktif', tone: 'off' };
  if (p.quota !== null && p.used_count >= p.quota) return { label: 'Kuota habis', tone: 'off' };
  if (p.ends_at && new Date(p.ends_at) <= now) return { label: 'Berakhir', tone: 'off' };
  if (p.starts_at && new Date(p.starts_at) > now) return { label: 'Terjadwal', tone: 'off' };
  return { label: 'Aktif', tone: 'on' };
}

const num = (v: number) => (Number.isNaN(v) ? null : v);

export default function PromoManager({ promos, categories, children }: { promos: PromoRule[]; categories: Category[]; children: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; data: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const now = new Date();

  const names: Record<string, string> = {};
  for (const c of categories) {
    names[c.id] = c.name;
    for (const p of c.products) names[p.id] = p.name;
  }

  const set = (patch: Partial<Draft>) => setEditing(e => (e ? { ...e, data: { ...e.data, ...patch } } : e));
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter(x => x !== id));

  const save = async () => {
    if (!editing) return;
    const d = editing.data;
    setSaving(true);
    setError('');
    try {
      const body = {
        ...d,
        value: d.value ?? NaN,
        min_spend: d.min_spend ?? 0,
        starts_at: fromDateTimeLocal(d.starts_at),
        ends_at: fromDateTimeLocal(d.ends_at),
        product_ids: d.scope === 'product' ? d.product_ids : [],
        category_ids: d.scope === 'category' ? d.category_ids : [],
      };
      if (editing.id) await send(`/api/admin/promos/${editing.id}`, 'PATCH', body);
      else await send('/api/admin/promos', 'POST', body);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const remove = (p: PromoRule) => {
    if (!confirm(`Hapus promo "${p.name}"?`)) return;
    void send(`/api/admin/promos/${p.id}`, 'DELETE').then(() => router.refresh(), e => alert(e.message));
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {children}
        <Button onClick={() => { setError(''); setEditing({ id: null, data: emptyDraft() }); }}><Plus /> Tambah promo</Button>
      </div>

      {promos.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          Belum ada promo. Contoh: &quot;Happy hour 20%&quot; Sen–Jum 14:00–16:00, atau kupon MARACA10.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {promos.map(p => {
            const s = status(p, now);
            return (
              <Card key={p.id} className={s.tone === 'off' ? 'opacity-70' : ''}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{p.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{describePromo(p, names)}</p>
                  </div>
                  <div className="flex shrink-0">
                    <Button size="icon-sm" variant="ghost" aria-label={`Ubah ${p.name}`} onClick={() => { setError(''); setEditing({ id: p.id, data: toDraft(p) }); }}><Pencil /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Hapus ${p.name}`} className="text-destructive hover:bg-destructive/10" onClick={() => remove(p)}><Trash2 /></Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-1 font-medium ${s.tone === 'on' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{s.label}</span>
                  {p.code && <span className="rounded-md border px-2 py-0.5 font-mono tracking-wide">{p.code}</span>}
                  <span className="ml-auto tabular-nums text-muted-foreground">Dipakai {p.used_count}{p.quota !== null ? `/${p.quota}` : '×'}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? 'Ubah promo' : 'Tambah promo'}</DialogTitle></DialogHeader>
          {editing && (() => {
            const d = editing.data;
            return (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="pr-name">Nama promo</Label>
                    <Input id="pr-name" value={d.name} onChange={e => set({ name: e.target.value })} placeholder="Happy hour 20%" autoFocus />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pr-code">Kode kupon (opsional)</Label>
                    <Input id="pr-code" value={d.code} onChange={e => set({ code: e.target.value.toUpperCase() })} placeholder="MARACA10" className="font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pr-quota">Kuota pemakaian (opsional)</Label>
                    <Input id="pr-quota" type="number" min={1} value={d.quota ?? ''} onChange={e => set({ quota: num(e.target.valueAsNumber) })} placeholder="Tanpa batas" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Diskon</Label>
                  <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-3">
                    <div className="flex overflow-hidden rounded-lg border">
                      {(['percent', 'amount'] as const).map(k => (
                        <button key={k} type="button" onClick={() => set({ kind: k })}
                          className={`px-3 py-1.5 text-sm ${d.kind === k ? 'bg-brand-strong text-white' : 'hover:bg-muted'}`}>
                          {k === 'percent' ? '%' : 'Rp'}
                        </button>
                      ))}
                    </div>
                    <Input aria-label="Nilai diskon" type="number" min={0} step={d.kind === 'percent' ? 1 : 500} value={d.value ?? ''}
                      onChange={e => set({ value: num(e.target.valueAsNumber) })} placeholder={d.kind === 'percent' ? '10' : '5000'} />
                    <Input aria-label="Maksimal diskon" type="number" min={0} step={500} value={d.max_discount ?? ''}
                      onChange={e => set({ max_discount: num(e.target.valueAsNumber) })} placeholder="Maks. diskon (Rp)" />
                  </div>
                  {d.kind === 'amount' && d.scope !== 'bill' && <p className="text-xs text-muted-foreground">Nominal berlaku per item yang cocok.</p>}
                </div>

                <div className="space-y-2">
                  <Label>Berlaku untuk</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([['bill', 'Seluruh bill'], ['category', 'Kategori'], ['product', 'Produk']] as const).map(([v, label]) => (
                      <button key={v} type="button" onClick={() => set({ scope: v })}
                        className={`rounded-lg border p-2 text-sm ${d.scope === v ? 'border-brand-strong bg-brand-soft' : 'hover:bg-muted'}`}>{label}</button>
                    ))}
                  </div>
                  {d.scope === 'category' && (
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map(c => (
                        <label key={c.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                          <Checkbox checked={d.category_ids.includes(c.id)} onCheckedChange={on => set({ category_ids: toggle(d.category_ids, c.id, !!on) })} />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  )}
                  {d.scope === 'product' && (
                    <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border p-3">
                      {categories.map(c => (
                        <div key={c.id}>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">{c.name}</p>
                          <div className="grid grid-cols-2 gap-1">
                            {c.products.map(p => (
                              <label key={p.id} className="flex items-center gap-2 text-sm">
                                <Checkbox checked={d.product_ids.includes(p.id)} onCheckedChange={on => set({ product_ids: toggle(d.product_ids, p.id, !!on) })} />
                                {p.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pr-min">Minimal belanja (opsional)</Label>
                  <Input id="pr-min" type="number" min={0} step={1000} value={d.min_spend ?? ''} onChange={e => set({ min_spend: num(e.target.valueAsNumber) })} placeholder="Rp" />
                </div>

                <div className="space-y-2">
                  <Label>Periode (opsional)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input aria-label="Mulai" type="datetime-local" value={d.starts_at} onChange={e => set({ starts_at: e.target.value })} />
                    <Input aria-label="Selesai" type="datetime-local" value={d.ends_at} onChange={e => set({ ends_at: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {WEEK_ORDER.map(day => (
                      <button key={day} type="button" onClick={() => set({ days: d.days.includes(day) ? d.days.filter(x => x !== day) : [...d.days, day] })}
                        className={`h-9 w-11 rounded-lg border text-sm ${d.days.includes(day) ? 'border-brand-strong bg-brand-strong text-white' : 'hover:bg-muted'}`}>{DAYS[day]}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input aria-label="Jam mulai" type="time" value={d.time_start} onChange={e => set({ time_start: e.target.value })} />
                    <Input aria-label="Jam selesai" type="time" value={d.time_end} onChange={e => set({ time_end: e.target.value })} />
                  </div>
                  <p className="text-xs text-muted-foreground">Hari kosong = setiap hari. Jam kosong = sepanjang hari. Waktu dalam WIB.</p>
                </div>

                <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <span className="font-medium">Aktif</span>
                  <Switch checked={d.is_active} onCheckedChange={is_active => set({ is_active })} />
                </label>
                {error && <Notice ok={false}>{error}</Notice>}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
            <Button onClick={save} disabled={saving || !editing?.data.name.trim() || editing?.data.value === null}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
