import { afterEach, describe, expect, it, vi } from 'vitest';
import { validSyncToken } from './token';

const TOKEN = 'k'.repeat(40);
afterEach(() => vi.unstubAllEnvs());

describe('validSyncToken', () => {
  it('accepts exactly the configured bearer token', () => {
    vi.stubEnv('VOUCHER_SYNC_TOKEN', TOKEN);
    expect(validSyncToken(`Bearer ${TOKEN}`)).toBe(true);
    expect(validSyncToken(`Bearer ${TOKEN}x`)).toBe(false);
    expect(validSyncToken(TOKEN)).toBe(false);
    expect(validSyncToken(null)).toBe(false);
  });

  it('refuses everything when the token is missing or shorter than 24 characters', () => {
    vi.stubEnv('VOUCHER_SYNC_TOKEN', '');
    expect(validSyncToken('Bearer ')).toBe(false);
    vi.stubEnv('VOUCHER_SYNC_TOKEN', 'short-token-123');
    expect(validSyncToken('Bearer short-token-123')).toBe(false);
  });
});
