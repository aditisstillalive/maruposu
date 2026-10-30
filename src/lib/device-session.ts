// Device session issued after the master PIN is entered on a POS tablet.
// The token is `<base64url payload>.<base64url HMAC-SHA256>`, signed with Web Crypto
// so the same code runs in middleware (Edge) and in route handlers (Node).

export const DEVICE_COOKIE = 'maru_device';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// The business day ends at 04:00 WIB, after the last late-night closing.
const DAY_END_HOUR_WIB = 4;

export type DevicePayload = {
  deviceId: string;
  pinVersion: number;
  exp: number; // epoch ms
};

/** The next 04:00 WIB strictly after `now`. */
export function businessDayEnd(now: Date): Date {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const endWib = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate(), DAY_END_HOUR_WIB);
  const end = endWib - WIB_OFFSET_MS;
  return new Date(end > now.getTime() ? end : end + DAY_MS);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signDeviceToken(payload: DevicePayload, secret: string): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

/** Returns the payload when the signature is valid and the token has not expired. */
export async function verifyDeviceToken(token: string | undefined, secret: string, now = new Date()): Promise<DevicePayload | null> {
  if (!token) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromBase64Url(sig),
      new TextEncoder().encode(body)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as DevicePayload;
    if (typeof payload.deviceId !== 'string' || typeof payload.pinVersion !== 'number' || typeof payload.exp !== 'number') {
      return null;
    }
    return payload.exp > now.getTime() ? payload : null;
  } catch {
    return null;
  }
}

export function deviceSecret(): string {
  const secret = process.env.DEVICE_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('DEVICE_SESSION_SECRET must be set (32+ characters)');
  return secret;
}
