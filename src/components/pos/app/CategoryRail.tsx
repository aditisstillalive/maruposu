'use client';

import type { SnapshotCategory } from '@/lib/pos/types';

export default function CategoryRail({ categories, active, onPick }: { categories: SnapshotCategory[]; active: string | null; onPick: (id: string) => void }) {
  return (
    <nav className="flex w-40 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-white p-2">
      {categories.map(c => (
        <button key={c.id} type="button" onClick={() => onPick(c.id)}
          className={`min-h-12 rounded-xl px-3 py-2 text-left text-sm font-medium ${active === c.id ? 'bg-brand-strong text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
          {c.name}
        </button>
      ))}
    </nav>
  );
}
