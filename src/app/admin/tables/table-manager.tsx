'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';

type Table = { id: string; name: string; token: string; is_active: boolean; sort_order: number; url: string; qr: string };
type Draft = { name: string; is_active: boolean; sort_order: number };

export default function TableManager({ tables, children }: { tables: Table[]; children: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; data: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await fn();
      if (done) setMsg(done);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const ok = await run(() => (editing.id ? send(`/api/admin/tables/${editing.id}`, 'PATCH', editing.data) : send('/api/admin/tables', 'POST', editing.data)));
    if (ok) setEditing(null);
  };
  const regenerate = (t: Table) => {
    if (!confirm(`Buat QR baru untuk Meja ${t.name}? QR lama yang sudah dicetak tidak bisa dipakai lagi.`)) return;
    void run(() => send(`/api/admin/tables/${t.id}`, 'PATCH', { regenerate: true }), `QR Meja ${t.name} diperbarui. Cetak ulang kartunya.`);
  };
  const remove = (t: Table) => {
    if (!confirm(`Hapus Meja ${t.name}? QR-nya berhenti bekerja; bill lama tetap tercatat dengan nama meja.`)) return;
    void run(() => send(`/api/admin/tables/${t.id}`, 'DELETE'));
  };
  const active = tables.filter(t => t.is_active);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {children}
        <div className="flex gap-2">
          {active.length > 0 && (
            <a href={`/admin/tables/print?ids=${active.map(t => t.id).join(',')}`} target="_blank" rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm hover:bg-gray-50">
              <Printer className="h-4 w-4" /> Cetak semua QR
            </a>
          )}
          <Button onClick={() => { setError(''); setEditing({ id: null, data: { name: '', is_active: true, sort_order: tables.length } }); }}>
            <Plus /> Tambah meja
          </Button>
        </div>
      </div>
      {msg && <div className="mb-4"><Notice ok>{msg}</Notice></div>}
      {error && !editing && <div className="mb-4"><Notice ok={false}>{error}</Notice></div>}

      {tables.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Belum ada meja. Tambahkan meja lalu cetak QR-nya untuk ditempel.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map(t => (
            <div key={t.id} className={`rounded-xl border bg-white p-4 ${t.is_active ? '' : 'opacity-60'}`} data-testid="table-card">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Meja {t.name}</h2>
                {!t.is_active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Nonaktif</span>}
              </div>
              <div className="mx-auto w-40" aria-label={`QR Meja ${t.name}`} role="img" dangerouslySetInnerHTML={{ __html: t.qr }} />
              <p className="mt-2 truncate text-center text-xs text-muted-foreground" title={t.url}>{t.url}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-1">
                <a href={`/admin/tables/print?ids=${t.id}`} target="_blank" rel="noreferrer" aria-label={`Cetak QR Meja ${t.name}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs hover:bg-gray-50"><Printer className="h-3.5 w-3.5" /> Cetak</a>
                <button type="button" disabled={busy} onClick={() => { setError(''); setEditing({ id: t.id, data: { name: t.name, is_active: t.is_active, sort_order: t.sort_order } }); }}
                  aria-label={`Ubah Meja ${t.name}`} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" /> Ubah</button>
                <button type="button" disabled={busy} onClick={() => regenerate(t)} aria-label={`QR baru Meja ${t.name}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs hover:bg-gray-50"><RefreshCw className="h-3.5 w-3.5" /> QR baru</button>
                <button type="button" disabled={busy} onClick={() => remove(t)} aria-label={`Hapus Meja ${t.name}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs text-red-700 hover:bg-gray-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Dialog open onOpenChange={o => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editing.id ? 'Ubah meja' : 'Tambah meja'}</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="table-name">Nama / nomor meja</Label>
              <Input id="table-name" autoFocus value={editing.data.name} placeholder="mis. 5 atau Teras 1"
                onChange={e => setEditing({ ...editing, data: { ...editing.data, name: e.target.value } })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-order">Urutan</Label>
              <Input id="table-order" type="number" min={0} value={editing.data.sort_order}
                onChange={e => setEditing({ ...editing, data: { ...editing.data, sort_order: Number(e.target.value) || 0 } })} />
            </div>
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span>Aktif (QR bisa dipakai memesan)</span>
              <Switch checked={editing.data.is_active} onCheckedChange={is_active => setEditing({ ...editing, data: { ...editing.data, is_active } })} />
            </label>
            {error && <Notice ok={false}>{error}</Notice>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
              <Button onClick={save} disabled={busy || !editing.data.name.trim()}>{busy ? 'Menyimpan...' : 'Simpan'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
