'use client';

import { useEffect, useState } from 'react';
import { usePosState } from '@/lib/pos/client/hooks';
import { setCashier } from '@/lib/pos/client/actions';
import { offlineSessionValid } from '@/lib/pos/client/offline-pin';
import { requestSync, startSyncLoop } from '@/lib/pos/client/sync';
import CashierPicker from './CashierPicker';
import LockScreen from './LockScreen';
import OpenShiftView from './OpenShiftView';
import OrderScreen from './OrderScreen';
import PrintButtons, { printReceipt } from './PrintButtons';
import CashMoveDialog from './CashMoveDialog';
import HistorySheet from './HistorySheet';
import RefundDialog from './RefundDialog';
import type { OrderDoc } from '@/lib/pos/types';
import Splash from './Splash';
import TopBar from './TopBar';

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * The cashier app. Works from IndexedDB, so everything below keeps going
 * without internet; the sync loop moves data to and from the server.
 */
export default function PosApp() {
  const state = usePosState();
  const online = useOnline();
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<'cash' | 'history' | { refund: OrderDoc } | null>(null);

  useEffect(() => {
    void offlineSessionValid().then(setUnlocked);
  }, []);
  useEffect(() => (unlocked ? startSyncLoop() : undefined), [unlocked]);

  const unlock = () => {
    setUnlocked(true);
    void requestSync();
  };

  if (unlocked === null || state.loading) return <Splash />;
  if (!unlocked) return <LockScreen reason="Masukkan master PIN untuk membuka kasir." onUnlocked={unlock} />;
  if (state.sync.status === 'locked') {
    return <LockScreen reason="Sesi tablet sudah berakhir. Masukkan master PIN supaya transaksi bisa tersinkron." onUnlocked={unlock} />;
  }
  if (!state.snapshot) {
    return <Splash text={online ? 'Menyiapkan menu dan data karyawan…' : 'Tablet ini belum pernah mengambil data menu. Sambungkan ke internet sekali untuk memulai.'} />;
  }

  const { snapshot, shift, cashier } = state;
  const refunding = panel && typeof panel === 'object' ? state.orders.find(o => o.id === panel.refund.id) ?? null : null;
  return (
    <div className="flex h-full flex-col bg-gray-50">
      <TopBar
        shift={shift}
        cashier={cashier}
        employees={snapshot.employees}
        sync={state.sync}
        rejected={state.rejected.length}
        online={online}
        onSwitchCashier={() => void setCashier(null)}
        actions={
          cashier && shift?.status === 'open' ? (
            <>
              <button type="button" onClick={() => setPanel('cash')} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Kas</button>
              <button type="button" onClick={() => setPanel('history')} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Riwayat</button>
            </>
          ) : null
        }
      />
      {!cashier ? (
        <CashierPicker employees={snapshot.employees} onPick={e => void setCashier(e)} />
      ) : !shift || shift.status !== 'open' ? (
        <OpenShiftView cashierId={cashier.id} />
      ) : (
        <OrderScreen
          snapshot={snapshot}
          cashier={cashier}
          orders={state.orders}
          paidActions={order => <PrintButtons order={order} snapshot={snapshot} />}
        />
      )}
      {cashier && panel === 'cash' && <CashMoveDialog moves={state.cashMoves} cashierId={cashier.id} onClose={() => setPanel(null)} />}
      {panel === 'history' && (
        <HistorySheet
          orders={state.orders}
          onReprint={o => printReceipt(o, snapshot)}
          onRefund={o => setPanel({ refund: o })}
          onClose={() => setPanel(null)}
        />
      )}
      {cashier && refunding && <RefundDialog order={refunding} cashierId={cashier.id} onClose={() => setPanel(null)} />}
    </div>
  );
}
