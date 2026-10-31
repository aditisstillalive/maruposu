import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensurePersistentStorage } from './persist';

const withStorage = (storage: unknown) => vi.stubGlobal('navigator', { storage });
afterEach(() => vi.unstubAllGlobals());

describe('ensurePersistentStorage', () => {
  it('keeps an existing grant without asking again', async () => {
    const persist = vi.fn();
    withStorage({ persisted: async () => true, persist });
    expect(await ensurePersistentStorage()).toBe('persisted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks the browser so offline sales are not evicted', async () => {
    withStorage({ persisted: async () => false, persist: async () => true });
    expect(await ensurePersistentStorage()).toBe('persisted');
  });

  it('reports a refusal', async () => {
    withStorage({ persisted: async () => false, persist: async () => false });
    expect(await ensurePersistentStorage()).toBe('denied');
  });

  it('copes with browsers without the API', async () => {
    withStorage(undefined);
    expect(await ensurePersistentStorage()).toBe('unsupported');
  });
});
