'use client';

import { useEffect, useState } from 'react';
import { usePosState } from '@/lib/pos/client/hooks';
import { setCashier } from '@/lib/pos/client/actions';
import { offlineSessionValid } from '@/lib/pos/client/offline-pin';
import { requestSync, startSyncLoop } from '@/lib/pos/client/sync';
import CashierPicker from './CashierPicker';
import LockScreen from './LockScreen';
import OpenShiftView from './OpenShiftView';
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
      />
      {!cashier ? (
        <CashierPicker employees={snapshot.employees} onPick={e => void setCashier(e)} />
      ) : !shift || shift.status !== 'open' ? (
        <OpenShiftView cashierId={cashier.id} />
      ) : (
        <section className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">Layar order</section>
      )}
    </div>
  );
}
