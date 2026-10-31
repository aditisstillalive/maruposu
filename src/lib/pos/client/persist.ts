export type StorageGrant = 'persisted' | 'denied' | 'unsupported';

/**
 * Asks the browser to keep this site's storage (the outbox of unsent sales, the
 * menu snapshot) even when the tablet runs low on space. Installed apps (the
 * Maraca POS APK, or a home-screen install) are normally granted.
 */
export async function ensurePersistentStorage(): Promise<StorageGrant> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.persist || !storage.persisted) return 'unsupported';
  if (await storage.persisted()) return 'persisted';
  return (await storage.persist()) ? 'persisted' : 'denied';
}
