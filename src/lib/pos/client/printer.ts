import { getKV, setKV } from './db';
import type { PaperWidth } from '../escpos';

/**
 * How this tablet prints.
 * - "android": inside the Maraca POS app, straight to a paired Bluetooth printer.
 * - "rawbt": in a browser, ESC/POS through the RawBT app (needs Google Play).
 * - "browser": the browser's print dialog.
 */
export type PrinterSettings = { mode: 'android' | 'rawbt' | 'browser'; paper: PaperWidth; device?: PairedPrinter | null };
export type PairedPrinter = { name: string; address: string };

/** What the Android app (android/) exposes to the page as window.MaracaAndroid. */
type AndroidBridge = {
  info(): string;
  printers(): string;
  print(id: string, address: string, base64: string): void;
};

declare global {
  interface Window {
    MaracaAndroid?: AndroidBridge;
  }
}

const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter';
// Longer than the app's own give-up time (3 connection attempts of 8 s)
const PRINT_TIMEOUT_MS = 45_000;

function bridge(): AndroidBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.MaracaAndroid;
}

/** Running inside the Maraca POS Android app. */
export const inAndroidApp = () => !!bridge();

export async function getPrinterSettings(): Promise<PrinterSettings> {
  const saved = await getKV('printer');
  const settings: PrinterSettings = { mode: inAndroidApp() ? 'android' : 'rawbt', paper: 58, device: null, ...saved };
  // A setting made in the app means nothing in a plain browser
  if (settings.mode === 'android' && !inAndroidApp()) settings.mode = 'rawbt';
  return settings;
}

export async function savePrinterSettings(settings: PrinterSettings): Promise<void> {
  await setKV('printer', settings);
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Bluetooth printers paired with the tablet (Android settings → Bluetooth). */
export function listAndroidPrinters(): { ok: boolean; printers: PairedPrinter[]; error?: string } {
  const b = bridge();
  if (!b) return { ok: false, printers: [], error: 'Bukan aplikasi Maraca POS' };
  try {
    const r = JSON.parse(b.printers()) as { ok: boolean; printers?: PairedPrinter[]; error?: string };
    return { ok: r.ok, printers: r.printers ?? [], ...(r.error ? { error: r.error } : {}) };
  } catch {
    return { ok: false, printers: [], error: 'Tidak bisa membaca daftar printer' };
  }
}

/** Sends ESC/POS bytes through the app; resolves once the printer took them. */
export function printAndroid(address: string, bytes: Uint8Array): Promise<void> {
  const b = bridge();
  if (!b) return Promise.reject(new Error('Bukan aplikasi Maraca POS'));
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const done = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; ok: boolean; error?: string }>).detail;
      if (detail?.id !== id) return;
      cleanup();
      if (detail.ok) resolve();
      else reject(new Error(detail.error || 'Gagal mencetak'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Printer tidak menjawab'));
    }, PRINT_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('maraca-print', done);
    };
    window.addEventListener('maraca-print', done);
    b.print(id, address, base64(bytes));
  });
}

/** Android intent that gives the bytes to RawBT, or opens its Play Store page if it's missing. */
export function rawbtUrl(bytes: Uint8Array): string {
  const store = `https://play.google.com/store/apps/details?id=${RAWBT_PACKAGE}`;
  return `intent:base64,${base64(bytes)}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};S.browser_fallback_url=${encodeURIComponent(store)};end;`;
}
