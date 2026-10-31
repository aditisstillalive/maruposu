import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { getPrinterSettings, listAndroidPrinters, printAndroid, savePrinterSettings } from './printer';

type Job = { id: string; address: string; base64: string };

function installBridge(answer: (job: Job) => { ok: boolean; error?: string }) {
  const jobs: Job[] = [];
  const target = new EventTarget();
  vi.stubGlobal('window', Object.assign(target, {
    MaracaAndroid: {
      info: () => JSON.stringify({ app: 'maruposu', version: '2.0.0' }),
      printers: () => JSON.stringify({ ok: true, printers: [{ name: 'MPT-II', address: '86:67:7A:00:11:22' }] }),
      print: (id: string, address: string, base64: string) => {
        jobs.push({ id, address, base64 });
        setTimeout(() => target.dispatchEvent(Object.assign(new Event('maraca-print'), { detail: { id, ...answer({ id, address, base64 }) } })), 5);
      },
    },
  }));
  return jobs;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => vi.unstubAllGlobals());

describe('inside the Maraca POS Android app', () => {
  it('prints through the app by default', async () => {
    installBridge(() => ({ ok: true }));
    expect(await getPrinterSettings()).toMatchObject({ mode: 'android', paper: 58 });
  });

  it('lists the paired Bluetooth printers', () => {
    installBridge(() => ({ ok: true }));
    expect(listAndroidPrinters()).toEqual({ ok: true, printers: [{ name: 'MPT-II', address: '86:67:7A:00:11:22' }] });
  });

  it('sends the bytes to the chosen printer and waits for the result', async () => {
    const jobs = installBridge(() => ({ ok: true }));
    await printAndroid('86:67:7A:00:11:22', Uint8Array.from([0x1b, 0x40, 0x41]));
    expect(jobs).toMatchObject([{ address: '86:67:7A:00:11:22', base64: 'G0BB' }]);
  });

  it('reports a printer that cannot be reached', async () => {
    installBridge(() => ({ ok: false, error: 'Printer tidak menjawab' }));
    await expect(printAndroid('86:67:7A:00:11:22', Uint8Array.from([0x41]))).rejects.toThrow('Printer tidak menjawab');
  });
});

describe('in a browser', () => {
  it('a saved app mode falls back to RawBT outside the app', async () => {
    vi.stubGlobal('window', new EventTarget());
    await savePrinterSettings({ mode: 'android', paper: 58, device: { name: 'MPT-II', address: 'x' } });
    expect((await getPrinterSettings()).mode).toBe('rawbt');
    expect(listAndroidPrinters()).toEqual({ ok: false, printers: [], error: 'Bukan aplikasi Maraca POS' });
  });
});
