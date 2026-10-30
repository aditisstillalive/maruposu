'use client';

import { useCallback, useEffect, useState } from 'react';
import { Delete, Loader2 } from 'lucide-react';
import { setKV } from '@/lib/pos/client/db';
import { checkOfflinePin, saveOfflineVerifier, startOfflineSession } from '@/lib/pos/client/offline-pin';

const LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

// Full page loads (not client navigation) so the service worker can serve /pos offline.
const goToPos = () => window.location.assign('/pos');

export default function PinPad({ onUnlocked = goToPos }: { onUnlocked?: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = useCallback(async (value: string) => {
    setLoading(true);
    setError('');
    let res: Response;
    try {
      res = await fetch('/api/device/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: value }),
      });
    } catch {
      // No internet: accept the PIN this tablet last unlocked with today
      if (await checkOfflinePin(value)) {
        await startOfflineSession();
        onUnlocked();
        return;
      }
      setError('Offline: PIN tidak cocok dengan PIN terakhir yang dipakai di tablet ini');
      setPin('');
      setLoading(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      await saveOfflineVerifier(value, data.pin_version, data.exp);
      await setKV('offline_session', data.exp);
      onUnlocked();
      return;
    }
    setError(data.error || 'Gagal membuka kunci');
    setPin('');
    setLoading(false);
  }, [onUnlocked]);

  const press = useCallback((key: string) => {
    if (loading) return;
    setError('');
    if (key === 'del') {
      setPin(p => p.slice(0, -1));
      return;
    }
    setPin(p => {
      if (p.length >= LENGTH) return p;
      const next = p + key;
      if (next.length === LENGTH) void submit(next);
      return next;
    });
  }, [loading, submit]);

  // Hardware keyboards (and testing on a laptop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  return (
    <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
      <p className="text-center text-sm font-medium text-gray-700">Masukkan master PIN</p>

      <div className="my-6 flex justify-center gap-3" aria-label={`${pin.length} dari ${LENGTH} digit`} role="status">
        {Array.from({ length: LENGTH }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border transition-colors ${
              i < pin.length ? 'border-black bg-black' : 'border-gray-300 bg-white'
            }`}
          />
        ))}
      </div>

      <p className="mb-4 h-5 text-center text-sm text-red-600" aria-live="polite">
        {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-500" /> : error}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              disabled={loading}
              aria-label={key === 'del' ? 'Hapus' : key}
              className="flex h-16 items-center justify-center rounded-xl border text-2xl font-light transition-colors hover:bg-gray-50 active:bg-brand-soft disabled:opacity-50"
            >
              {key === 'del' ? <Delete className="h-6 w-6" /> : key}
            </button>
          )
        )}
      </div>
    </div>
  );
}
