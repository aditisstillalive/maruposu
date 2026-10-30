'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import EmployeeAvatar from './EmployeeAvatar';

type Employee = { id: string; name: string; photo_url: string | null };

export default function EmployeeGrid({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  const pick = async (id: string) => {
    setPending(id);
    setError('');
    const res = await fetch('/api/device/cashier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: id }),
    }).catch(() => null);
    if (res?.ok) {
      router.push('/pos');
      return;
    }
    if (res?.status === 401) {
      router.replace('/');
      return;
    }
    setError('Gagal memilih karyawan. Coba lagi.');
    setPending(null);
  };

  if (employees.length === 0) {
    return (
      <p className="mt-10 rounded-xl border border-dashed bg-white p-8 text-center text-sm text-gray-500">
        Belum ada karyawan aktif. Tambahkan di Admin → Karyawan.
      </p>
    );
  }

  return (
    <>
      {error && <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {employees.map(e => (
          <button
            key={e.id}
            type="button"
            onClick={() => pick(e.id)}
            disabled={pending !== null}
            className={`flex flex-col items-center gap-3 rounded-2xl border bg-white p-6 transition-colors hover:border-gray-400 active:bg-brand-soft disabled:opacity-60 ${
              pending === e.id ? 'border-brand-strong ring-2 ring-brand' : ''
            }`}
          >
            <EmployeeAvatar name={e.name} photoUrl={e.photo_url} />
            <span className="text-base font-medium">{e.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
