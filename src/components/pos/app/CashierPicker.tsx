'use client';

import EmployeeAvatar from '@/components/pos/EmployeeAvatar';
import type { SnapshotEmployee } from '@/lib/pos/types';

export default function CashierPicker({ employees, onPick }: { employees: SnapshotEmployee[]; onPick: (e: SnapshotEmployee) => void }) {
  return (
    <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="font-heading text-2xl font-light tracking-tight md:text-3xl">Siapa yang melayani?</h1>
      <p className="mt-1 text-sm text-gray-500">Nama ini tercetak di bill sebagai kasir.</p>
      {employees.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed bg-white p-8 text-center text-sm text-gray-500">
          Belum ada karyawan aktif. Tambahkan di Admin → Karyawan.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {employees.map(e => (
            <button key={e.id} type="button" onClick={() => onPick(e)}
              className="flex flex-col items-center gap-3 rounded-2xl border bg-white p-6 transition-colors hover:border-gray-400 active:bg-brand-soft">
              <EmployeeAvatar name={e.name} photoUrl={e.photo_url} />
              <span className="text-base font-medium">{e.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
