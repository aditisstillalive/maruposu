'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

export default function MasterPinForm({ lastChange }: { lastChange: { by: string; at: string } | null }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await send('/api/admin/master-pin', 'PUT', { pin, confirm });
      setPin('');
      setConfirm('');
      setMsg({ ok: true, text: 'Master PIN diganti. Semua tablet kasir terkunci dan harus memakai PIN baru.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Ganti master PIN</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pin">PIN baru</Label>
            <Input id="pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin}
              onChange={e => setPin(digits(e.target.value))} placeholder="••••••" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Ulangi PIN baru</Label>
            <Input id="confirm" type="password" inputMode="numeric" autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(digits(e.target.value))} placeholder="••••••" required />
          </div>
          <Button type="submit" disabled={saving || pin.length !== 6 || confirm.length !== 6}>
            {saving ? 'Menyimpan...' : 'Ganti PIN'}
          </Button>
          {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
          {lastChange && (
            <p className="text-xs text-muted-foreground">
              PIN terakhir diganti oleh {lastChange.by} pada{' '}
              {new Date(lastChange.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
