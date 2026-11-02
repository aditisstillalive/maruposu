import type { Viewport } from 'next';

// Customers may pinch-zoom the menu (the till keeps zoom off, see the root layout)
export const viewport: Viewport = { maximumScale: 5, userScalable: true };

export default function TableLayout({ children }: { children: React.ReactNode }) {
  return children;
}
