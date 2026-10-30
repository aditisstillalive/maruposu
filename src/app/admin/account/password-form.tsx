'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Notice from '@/components/admin/Notice';
import { send } from '@/lib/api-client';
import { ADMIN_PASSWORD_MIN } from '@/lib/schemas';

const empty = { current: '', password: '', confirm: '' };

export default function PasswordForm() {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<typeof empty>) => setForm(f => ({ ...f, ...patch }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await send('/api/admin/account/password', 'PUT', form);
      setForm(empty);
      setMsg({ ok: true, text: 'Password diganti. Pakai password baru saat masuk berikutnya.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Ganti password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current">Password lama</Label>
            <Input id="current" type="password" autoComplete="current-password" value={form.current} onChange={e => set({ current: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Password baru</Label>
            <Input id="new-password" type="password" autoComplete="new-password" minLength={ADMIN_PASSWORD_MIN} value={form.password} onChange={e => set({ password: e.target.value })} required />
            <p className="text-xs text-muted-foreground">Minimal {ADMIN_PASSWORD_MIN} karakter.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Ulangi password baru</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={form.confirm} onChange={e => set({ confirm: e.target.value })} required />
          </div>
          <Button type="submit" disabled={saving || !form.current || form.password.length < ADMIN_PASSWORD_MIN || !form.confirm}>
            {saving ? 'Menyimpan...' : 'Ganti password'}
          </Button>
          {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
        </form>
      </CardContent>
    </Card>
  );
}
