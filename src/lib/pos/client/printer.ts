import { getKV, setKV } from './db';
import type { PaperWidth } from '../escpos';

/**
 * How this tablet prints. "rawbt": ESC/POS straight to a Bluetooth thermal
 * printer through the RawBT app (one tap, no dialog). "browser": the browser's
 * print dialog (printers Android/Chrome can see).
 */
export type PrinterSettings = { mode: 'rawbt' | 'browser'; paper: PaperWidth };

const DEFAULTS: PrinterSettings = { mode: 'rawbt', paper: 58 };
const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter';

export async function getPrinterSettings(): Promise<PrinterSettings> {
  return { ...DEFAULTS, ...(await getKV('printer')) };
}

export async function savePrinterSettings(settings: PrinterSettings): Promise<void> {
  await setKV('printer', settings);
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Android intent that gives the bytes to RawBT, or opens its Play Store page if it's missing. */
export function rawbtUrl(bytes: Uint8Array): string {
  const store = `https://play.google.com/store/apps/details?id=${RAWBT_PACKAGE}`;
  return `intent:base64,${base64(bytes)}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};S.browser_fallback_url=${encodeURIComponent(store)};end;`;
}
