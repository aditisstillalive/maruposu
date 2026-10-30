'use client';

import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

/**
 * Prints one receipt/ticket through the browser's print dialog. The node is
 * rendered into #print-root, which the print stylesheet shows on its own.
 */
export function printNode(node: ReactNode): void {
  let host = document.getElementById('print-root');
  if (!host) {
    host = document.createElement('div');
    host.id = 'print-root';
    document.body.appendChild(host);
  }
  const root = createRoot(host);
  flushSync(() => root.render(node));
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    root.unmount();
  };
  window.addEventListener('afterprint', cleanup);
  // Let images (the wordmark) load before the dialog snapshots the page
  const imgs = Array.from(host.querySelectorAll('img'));
  Promise.all(imgs.map(img => (img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })))).then(() => window.print());
}
