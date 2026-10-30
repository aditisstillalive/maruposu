'use client';

import { Lock } from 'lucide-react';
import { endOfflineSession } from '@/lib/pos/client/offline-pin';

export default function LockButton() {
  const lock = async () => {
    await endOfflineSession();
    await fetch('/api/device/lock', { method: 'POST' }).catch(() => null);
    window.location.assign('/');
  };
  return (
    <button
      type="button"
      onClick={lock}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    >
      <Lock className="h-4 w-4" />
      Kunci
    </button>
  );
}
