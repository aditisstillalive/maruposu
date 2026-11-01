'use client';

import { useEffect } from 'react';

/** Opens the print dialog once the QR cards are on screen. */
export default function PrintOnLoad() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return null;
}
