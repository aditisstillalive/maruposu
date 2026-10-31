import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuid } from './uuid';

const real = globalThis.crypto;
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
afterEach(() => vi.unstubAllGlobals());

describe('uuid', () => {
  it('works where crypto.randomUUID is missing (WebView older than Chrome 92)', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const ids = Array.from({ length: 200 }, uuid);
    expect(ids.every(id => V4.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(200);
  });

  it('uses crypto.randomUUID when there is one', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111', getRandomValues: () => { throw new Error('unused'); } });
    expect(uuid()).toBe('11111111-1111-4111-8111-111111111111');
  });
});
