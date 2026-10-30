'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MonitorSmartphone, Coffee, SlidersHorizontal, UserRound, Settings, KeyRound, Users, LogOut, Menu, X, ShieldCheck } from 'lucide-react';

const navigation = [
  { name: 'Menu', href: '/admin/menu', icon: Coffee },
  { name: 'Varian & Add-on', href: '/admin/options', icon: SlidersHorizontal },
  { name: 'Karyawan', href: '/admin/employees', icon: UserRound },
  { name: 'Pengaturan', href: '/admin/settings', icon: Settings },
  { name: 'Akun', href: '/admin/account', icon: ShieldCheck },
];

interface AdminSidebarProps {
  isSuperAdmin: boolean;
}

export default function AdminSidebar({ isSuperAdmin }: AdminSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allNavigation = [
    ...navigation,
    ...(isSuperAdmin
      ? [
          { name: 'Master PIN', href: '/admin/master-pin', icon: KeyRound },
          { name: 'Users', href: '/admin/users', icon: Users },
        ]
      : []),
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const current = allNavigation.find(item => isActive(item.href));

  // Close the mobile drawer after navigating
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock page scroll while the drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const links = (
    <>
      <nav className="px-2 py-1 space-y-0.5 flex-shrink-0">
        {allNavigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={`flex items-center gap-2 px-2 py-2 md:py-1 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.href) ? 'bg-brand-soft text-black' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </Link>
        ))}
      </nav>
      <div className="p-2 border-t space-y-1 flex-shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2 px-2 py-2 md:py-1 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <MonitorSmartphone className="h-4 w-4" />
          Buka POS
        </Link>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="flex items-center gap-2 px-2 py-2 md:py-1 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors w-full">
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile: top bar + slide-in drawer */}
      <div className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b bg-white px-2 py-2 print:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
          aria-label="Buka menu admin"
          aria-expanded={mobileOpen}
          aria-controls="admin-mobile-nav"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold tracking-tight">Admin</span>
        {current && <span className="text-sm text-gray-500">/ {current.name}</span>}
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside id="admin-mobile-nav" className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-2">
              <h1 className="text-lg font-bold tracking-tight">Admin</h1>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
                aria-label="Tutup menu admin"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {links}
          </aside>
        </div>
      )}

      {/* Desktop: fixed sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r h-full flex-col flex-shrink-0 print:hidden">
        <div className="p-2 border-b flex-shrink-0">
          <h1 className="text-lg font-bold tracking-tight">Admin</h1>
        </div>
        {links}
      </aside>
    </>
  );
}
