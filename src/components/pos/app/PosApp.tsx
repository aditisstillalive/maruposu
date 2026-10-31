'use client';

import { useEffect, useState } from 'react';
import { usePosState } from '@/lib/pos/client/hooks';
import { setCashier } from '@/lib/pos/client/actions';
import { setKV } from '@/lib/pos/client/db';
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
import CloseShiftView from './CloseShiftView';
import ClosedView from './ClosedView';
import WasteDialog from './WasteDialog';
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
  const [panel, setPanel] = useState<'cash' | 'history' | 'waste' | { refund: OrderDoc } | null>(null);
  // The shift being closed (by id, so the next shift starts on the order screen)
  const [closingId, setClosingId] = useState<string | null>(null);

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
  const shiftOpen = shift?.status === 'open';
  // A count locked for this shift keeps the tablet on the closing screen
  const lock = state.countLock && shiftOpen && state.countLock.shift_id === shift!.id ? state.countLock : null;
  const closing = shiftOpen && closingId === shift!.id;
  const refunding = panel && typeof panel === 'object' ? state.orders.find(o => o.id === panel.refund.id) ?? null : null;
  return (
    <div className="flex h-full flex-col bg-gray-50">
      <TopBar
        shift={shift}
        cashier={cashier}
        employees={snapshot.employees}
        sync={state.sync}
        rejected={state.rejected.length}
        lowStock={snapshot.low_stock}
        cafeName={snapshot.setting.cafe_name}
        online={online}
        onSwitchCashier={() => void setCashier(null)}
        actions={
          cashier && shiftOpen && !lock && !closing ? (
            <>
              <button type="button" onClick={() => setClosingId(shift!.id)} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Tutup Kasir</button>
              <button type="button" onClick={() => setPanel('cash')} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Kas</button>
              <button type="button" onClick={() => setPanel('history')} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Riwayat</button>
              <button type="button" onClick={() => setPanel('waste')} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Waste</button>
            </>
          ) : null
        }
      />
      {!cashier ? (
        <CashierPicker employees={snapshot.employees} onPick={e => void setCashier(e)} />
      ) : state.lastClose && !state.lastClose.seen ? (
        <ClosedView closed={state.lastClose} snapshot={snapshot} />
      ) : !shiftOpen ? (
        <>
          {state.closedRemotely && (
            <div role="alert" className="mx-auto mt-6 flex w-full max-w-md items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <span className="flex-1">
                Shift {state.closedRemotely.business_date} sudah ditutup dari admin. Laporannya ada di Admin → Kas Kasir.
                {state.rejected.length > 0 && ` ${state.rejected.length} transaksi tablet ditolak server.`}
              </span>
              <button type="button" onClick={() => void setKV('closed_remotely', null)} className="font-medium underline">OK</button>
            </div>
          )}
          <OpenShiftView cashierId={cashier.id} />
        </>
      ) : closing || lock ? (
        <CloseShiftView
          openBills={state.orders.filter(o => o.status === 'open')}
          lock={lock}
          cashierId={cashier.id}
          onBack={() => setClosingId(null)}
        />
      ) : (
        <OrderScreen
          snapshot={snapshot}
          cashier={cashier}
          orders={state.orders}
          paidActions={order => <PrintButtons order={order} snapshot={snapshot} />}
        />
      )}
      {cashier && panel === 'waste' && <WasteDialog snapshot={snapshot} cashierId={cashier.id} onClose={() => setPanel(null)} />}
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
