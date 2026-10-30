'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  inSync: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

function formatWIB(value: string) {
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
}

export function ReplicaStatus({ inSync, lastSyncedAt, lastError }: Props) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/replica-sync', { method: 'POST' });
      const data = await res.json();
      setMessage(data.ok ? `${data.rows} baris tersinkron.` : `Sinkronisasi gagal: ${data.error}`);
      router.refresh();
    } catch {
      setMessage('Sinkronisasi gagal: tidak ada koneksi');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="my-6">
      <CardHeader>
        <CardTitle>Database kedua (replica)</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-sm">
            <p>
              Status:{' '}
              {inSync ? (
                <span className="text-green-700">Sinkron, ikut melayani bacaan POS</span>
              ) : (
                <span className="text-amber-700">Belum sinkron, POS hanya membaca dari primary</span>
              )}
            </p>
            <p className="text-muted-foreground">
              Sinkron penuh terakhir: {lastSyncedAt ? formatWIB(lastSyncedAt) : 'belum pernah'}
            </p>
            {!inSync && lastError && <p className="text-xs text-red-700 break-all">Error terakhir: {lastError}</p>}
            {message && <p className="text-xs">{message}</p>}
          </div>
          <Button onClick={handleSync} disabled={syncing} variant="outline" className="gap-2">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sinkronkan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
