const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
// Matches the device session: the business day ends at 04:00 WIB.
const DAY_START_HOUR_WIB = 4;

/** WIB date of the business day `now` belongs to, as YYYY-MM-DD. */
export function businessDateWIB(now: Date): string {
  return new Date(now.getTime() + WIB_OFFSET_MS - DAY_START_HOUR_WIB * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** e.g. orderCode('2026-10-30', 'A7', 14) === '261030-A7-014' */
export function orderCode(businessDate: string, deviceTag: string, seq: number): string {
  return `${businessDate.slice(2).replace(/-/g, '')}-${deviceTag}-${String(seq).padStart(3, '0')}`;
}
