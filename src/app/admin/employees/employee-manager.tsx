'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Notice from '@/components/admin/Notice';
import PhotoInput from '@/components/admin/PhotoInput';
import EmployeeAvatar from '@/components/pos/EmployeeAvatar';
import { send } from '@/lib/api-client';

type Employee = { id: string; name: string; photo_url: string | null; is_active: boolean; sort_order: number };
type Draft = Omit<Employee, 'id'>;

const emptyDraft = (): Draft => ({ name: '', photo_url: null, is_active: true, sort_order: 0 });

export default function EmployeeManager({ employees, children }: { employees: Employee[]; children: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; data: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const open = (e?: Employee) => {
    setError('');
    setEditing(e ? { id: e.id, data: { name: e.name, photo_url: e.photo_url, is_active: e.is_active, sort_order: e.sort_order } } : { id: null, data: emptyDraft() });
  };
  const set = (patch: Partial<Draft>) => setEditing(ed => (ed ? { ...ed, data: { ...ed.data, ...patch } } : ed));

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      if (editing.id) await send(`/api/admin/employees/${editing.id}`, 'PATCH', editing.data);
      else await send('/api/admin/employees', 'POST', editing.data);
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
        <Button onClick={() => open()}><Plus /> Tambah karyawan</Button>
      </div>

      {employees.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Belum ada karyawan.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {employees.map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => open(e)}
              className={`group relative flex flex-col items-center gap-3 rounded-xl border bg-white p-5 text-center transition-colors hover:border-gray-400 ${e.is_active ? '' : 'opacity-50'}`}
            >
              <Pencil className="absolute right-3 top-3 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
              <EmployeeAvatar name={e.name} photoUrl={e.photo_url} />
              <span className="font-medium">{e.name}</span>
              {!e.is_active && <span className="text-xs text-muted-foreground">Nonaktif</span>}
            </button>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Ubah karyawan' : 'Tambah karyawan'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emp-name">Nama (tercetak di bill)</Label>
                <Input id="emp-name" value={editing.data.name} onChange={e => set({ name: e.target.value })} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>Foto (opsional)</Label>
                <PhotoInput prefix="employees" value={editing.data.photo_url} onChange={photo_url => set({ photo_url })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-order">Urutan tampil</Label>
                <Input id="emp-order" type="number" value={editing.data.sort_order} onChange={e => set({ sort_order: e.target.valueAsNumber || 0 })} />
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
