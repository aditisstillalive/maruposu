'use client';

import { useEffect } from 'react';

// The build id makes each deploy install a fresh worker with fresh caches.
export default function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'}`).catch(e => console.warn('Service worker not registered:', e));
  }, []);
  return null;
}
