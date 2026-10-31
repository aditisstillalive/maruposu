'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { PRINT_ERROR_EVENT } from '@/components/pos/print/print';

/** A failed print (printer off, out of range, none chosen), shown until dismissed or 8 s pass. */
export default function PrintNotice() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 8000);
    };
    window.addEventListener(PRINT_ERROR_EVENT, show);
    return () => {
      window.removeEventListener(PRINT_ERROR_EVENT, show);
      clearTimeout(timer);
    };
  }, []);
  if (!message) return null;
  return (
    <div role="alert" className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-lg items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={() => setMessage(null)} aria-label="Tutup"><X className="h-4 w-4" /></button>
    </div>
  );
}
