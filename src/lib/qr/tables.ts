import { randomBytes } from 'node:crypto';

/** 22 random URL-safe characters: the QR can't be guessed from another table's. */
export const newTableToken = () => randomBytes(16).toString('base64url');

/** What a table's QR code opens. */
export const tableUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/t/${token}`;
