'use client';

import Image from 'next/image';
import { AlertTriangle, CloudOff, KeyRound, RefreshCw, Check } from 'lucide-react';
import EmployeeAvatar from '@/components/pos/EmployeeAvatar';
import LockButton from '@/components/pos/LockButton';
import { site } from '@/lib/site';
import type { SyncState } from '@/lib/pos/client/db';
import type { ShiftDoc, SnapshotEmployee } from '@/lib/pos/types';

const timeWIB = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

function SyncBadge({ sync, online }: { sync: SyncState; online: boolean }) {
  const pending = sync.pending > 0 ? `${sync.pending} belum tersinkron` : null;
  if (sync.status === 'locked') return <Badge tone="warn" icon={<KeyRound />}>Perlu PIN untuk sinkron</Badge>;
  if (!online || sync.status === 'offline') return <Badge tone="warn" icon={<CloudOff />}>Offline{pending ? ` · ${pending}` : ''}</Badge>;
  if (sync.status === 'error') return <Badge tone="warn" icon={<AlertTriangle />}>Gagal sinkron{pending ? ` · ${pending}` : ''}</Badge>;
  if (pending) return <Badge tone="muted" icon={<RefreshCw className="animate-spin" />}>{pending}</Badge>;
  return <Badge tone="ok" icon={<Check />}>Tersinkron</Badge>;
}

function Badge({ tone, icon, children }: { tone: 'ok' | 'warn' | 'muted'; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = tone === 'warn' ? 'bg-amber-50 text-amber-800' : tone === 'ok' ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-600';
  return (
    <span role="status" className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium [&_svg]:h-3.5 [&_svg]:w-3.5 ${cls}`}>
      {icon}
      {children}
    </span>
  );
}

export default function TopBar({
  shift,
  cashier,
  employees,
  sync,
  rejected,
  lowStock,
  online,
  onSwitchCashier,
  actions,
}: {
  shift: ShiftDoc | null;
  cashier: SnapshotEmployee | null;
  employees: SnapshotEmployee[];
  sync: SyncState;
  rejected: number;
  lowStock?: { count: number; names: string[] };
  online: boolean;
  onSwitchCashier: () => void;
  actions?: React.ReactNode;
}) {
  const opener = shift ? employees.find(e => e.id === shift.opened_by)?.name ?? '?' : null;
  return (
    <header className="flex items-center gap-3 border-b bg-white px-4 py-2">
      <Image src={site.wordmark} alt={site.name} width={475} height={138} className="h-7 w-auto" unoptimized />
      {shift && <span className="hidden text-xs text-gray-500 lg:inline">Shift dibuka {timeWIB(shift.opened_at)} oleh {opener}</span>}
      <span className="ml-auto" />
      {rejected > 0 && <Badge tone="warn" icon={<AlertTriangle />}>{rejected} ditolak server</Badge>}
      {lowStock && lowStock.count > 0 && (
        <span title={lowStock.names.join(', ')} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">{lowStock.count} bahan menipis</span>
      )}
      <SyncBadge sync={sync} online={online} />
      {actions}
      {cashier && (
        <button type="button" onClick={onSwitchCashier} title="Ganti kasir"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-100">
          <EmployeeAvatar name={cashier.name} photoUrl={cashier.photo_url} size="sm" />
          <span>Kasir: <span className="font-medium">{cashier.name}</span></span>
        </button>
      )}
      <LockButton />
    </header>
  );
}
