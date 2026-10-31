'use client';

import Image from 'next/image';
import PinPad from '@/components/pos/PinPad';
import { site } from '@/lib/site';

export default function LockScreen({ reason, onUnlocked }: { reason: string; onUnlocked: () => void }) {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <Image src={site.logo} alt={site.name} width={487} height={284} priority className="mb-4 h-auto w-48" unoptimized />
      <p className="mb-6 max-w-sm text-center text-sm text-gray-500">{reason}</p>
      <PinPad onUnlocked={onUnlocked} />
    </main>
  );
}
