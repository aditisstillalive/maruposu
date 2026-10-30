'use client';

import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

export default function LockButton() {
  const router = useRouter();
  const lock = async () => {
    await fetch('/api/device/lock', { method: 'POST' }).catch(() => null);
    router.replace('/');
    router.refresh();
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
