'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getPrinterSettings, savePrinterSettings, type PrinterSettings } from '@/lib/pos/client/printer';
import { printTest } from '@/components/pos/print/print';

const choice = (active: boolean) =>
  `flex-1 rounded-xl border px-3 py-2 text-left text-sm ${active ? 'border-black bg-brand-soft font-medium' : 'bg-white hover:bg-gray-50'}`;

/** This tablet's printer: RawBT (Bluetooth thermal) or the browser dialog, paper width, and a test print. */
export default function PrinterButton({ cafeName }: { cafeName: string }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  useEffect(() => {
    if (open) void getPrinterSettings().then(setSettings);
  }, [open]);
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
            {settings.mode === 'rawbt' && (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Lebar kertas</legend>
                <div className="flex gap-2" role="radiogroup" aria-label="Lebar kertas">
                  {([58, 80] as const).map(w => (
                    <button key={w} type="button" role="radio" aria-checked={settings.paper === w} className={choice(settings.paper === w)} onClick={() => update({ ...settings, paper: w })}>{w} mm</button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Butuh aplikasi <span className="font-medium">RawBT</span> (Play Store) dengan printer Bluetooth-nya sudah dipilih di RawBT.
                </p>
              </fieldset>
            )}
            <DialogFooter>
              <Button variant="outline" className="h-11" onClick={() => void printTest(cafeName)}>Tes cetak</Button>
              <Button className="h-11" onClick={() => setOpen(false)}>Selesai</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
