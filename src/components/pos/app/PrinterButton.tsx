'use client';

import { useEffect, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getPrinterSettings, inAndroidApp, listAndroidPrinters, savePrinterSettings, type PairedPrinter, type PrinterSettings } from '@/lib/pos/client/printer';
import { printTest } from '@/components/pos/print/print';
import { getKV } from '@/lib/pos/client/db';
import type { StorageGrant } from '@/lib/pos/client/persist';

const choice = (active: boolean) =>
  `flex-1 rounded-xl border px-3 py-2 text-left text-sm ${active ? 'border-black bg-brand-soft font-medium' : 'bg-white hover:bg-gray-50'}`;

/** This tablet's printer and offline storage; a test print. */
export default function PrinterButton({ cafeName }: { cafeName: string }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  const [grant, setGrant] = useState<StorageGrant | undefined>();
  const [paired, setPaired] = useState<{ printers: PairedPrinter[]; error?: string }>({ printers: [] });
  const app = inAndroidApp();
  const refresh = () => setPaired(listAndroidPrinters());
  useEffect(() => {
    if (!open) return;
    void getPrinterSettings().then(setSettings);
    void getKV('storage_grant').then(setGrant);
    if (app) refresh();
  }, [open, app]);
  const update = (next: PrinterSettings) => {
    setSettings(next);
    void savePrinterSettings(next);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Printer" aria-label="Pengaturan printer" className="rounded-lg p-2 text-gray-600 hover:bg-gray-100">
        <Printer className="h-5 w-5" />
      </button>
      {open && settings && (
        <Dialog open onOpenChange={o => !o && setOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Printer tablet ini</DialogTitle></DialogHeader>
            {app ? (
              <fieldset className="space-y-2">
                <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
                  Printer Bluetooth
                  <button type="button" onClick={refresh} className="flex items-center gap-1 text-xs font-normal text-gray-600 hover:underline"><RefreshCw className="h-3 w-3" /> Muat ulang</button>
                </legend>
                <div className="space-y-2" role="radiogroup" aria-label="Printer Bluetooth">
                  {paired.printers.map(p => (
                    <button key={p.address} type="button" role="radio" aria-checked={settings.device?.address === p.address} className={`${choice(settings.device?.address === p.address)} w-full`}
                      onClick={() => update({ ...settings, mode: 'android', device: p })}>
                      {p.name}
                      <span className="block text-xs font-normal text-gray-500">{p.address}</span>
                    </button>
                  ))}
                </div>
                {paired.error && <p className="text-xs text-red-700">{paired.error}</p>}
                {!paired.printers.length && !paired.error && (
                  <p className="text-xs text-gray-500">Belum ada printer. Nyalakan printer, pair dulu di Pengaturan Android → Bluetooth, lalu tekan Muat ulang.</p>
                )}
              </fieldset>
            ) : (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Cara cetak</legend>
                <div className="flex gap-2" role="radiogroup" aria-label="Cara cetak">
                  <button type="button" role="radio" aria-checked={settings.mode === 'rawbt'} className={choice(settings.mode === 'rawbt')} onClick={() => update({ ...settings, mode: 'rawbt' })}>
                    Langsung (RawBT)
                    <span className="block text-xs font-normal text-gray-500">Printer thermal Bluetooth, sekali tap</span>
                  </button>
                  <button type="button" role="radio" aria-checked={settings.mode === 'browser'} className={choice(settings.mode === 'browser')} onClick={() => update({ ...settings, mode: 'browser' })}>
                    Dialog print
                    <span className="block text-xs font-normal text-gray-500">Printer yang terlihat di Android/Chrome</span>
                  </button>
                </div>
              </fieldset>
            )}
            {settings.mode !== 'browser' && (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Lebar kertas</legend>
                <div className="flex gap-2" role="radiogroup" aria-label="Lebar kertas">
                  {([58, 80] as const).map(w => (
                    <button key={w} type="button" role="radio" aria-checked={settings.paper === w} className={choice(settings.paper === w)} onClick={() => update({ ...settings, paper: w })}>{w} mm</button>
                  ))}
                </div>
                {settings.mode === 'rawbt' && (
                  <p className="text-xs text-gray-500">
                    Butuh aplikasi <span className="font-medium">RawBT</span> (Play Store) dengan printer Bluetooth-nya sudah dipilih di RawBT.
                  </p>
                )}
              </fieldset>
            )}
            {app && <p className="text-xs text-gray-400" data-testid="webview-version">Aplikasi Maraca POS · {navigator.userAgent.match(/Chrome\/(\d+)/)?.[0] ?? 'WebView'}</p>}
            <p className={`rounded-lg px-3 py-2 text-xs ${app || grant === 'persisted' ? 'bg-gray-50 text-gray-600' : 'bg-amber-50 text-amber-800'}`} data-testid="storage-grant">
              {app
                ? 'Penyimpanan offline: di dalam aplikasi Maraca POS — penjualan yang belum terkirim aman.'
                : grant === 'persisted'
                  ? 'Penyimpanan offline: permanen — penjualan yang belum terkirim aman.'
                  : 'Penyimpanan offline: belum permanen — pasang aplikasi Maraca POS (APK) agar penjualan offline tidak bisa terhapus saat memori penuh.'}
            </p>
            <DialogFooter>
              <Button variant="outline" className="h-11" disabled={settings.mode === 'android' && !settings.device} onClick={() => void printTest(cafeName)}>Tes cetak</Button>
              <Button className="h-11" onClick={() => setOpen(false)}>Selesai</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
