import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getPrinterSettings, rawbtUrl, savePrinterSettings } from './printer';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('printer settings', () => {
  it('prints straight to RawBT on 58 mm paper until changed', async () => {
    expect(await getPrinterSettings()).toEqual({ mode: 'rawbt', paper: 58 });
  });

  it('remembers this tablet\'s choice', async () => {
    await savePrinterSettings({ mode: 'browser', paper: 80 });
    expect(await getPrinterSettings()).toEqual({ mode: 'browser', paper: 80 });
  });
});

describe('rawbtUrl', () => {
  it('hands the bytes to the RawBT app as base64', () => {
    const url = rawbtUrl(Uint8Array.from([0x1b, 0x40, 0x48, 0x69, 0x0a]));
    expect(url.startsWith('intent:base64,G0BIaQo=#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;')).toBe(true);
    expect(url.endsWith(';end;')).toBe(true);
  });

  it('sends people to the Play Store when RawBT is not installed', () => {
    expect(rawbtUrl(new Uint8Array([0x41]))).toContain(`S.browser_fallback_url=${encodeURIComponent('https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter')}`);
  });
});
