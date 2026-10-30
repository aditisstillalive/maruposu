// <input type="datetime-local"> holds a wall-clock time with no timezone. Convert in the
// browser so the admin's local time (WIB) is what gets stored, not the server's (UTC).

/** "2026-10-28T11:45" (browser local) -> ISO string with offset applied; '' -> null */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value); // parsed as local time in the browser
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO/UTC from the API -> "YYYY-MM-DDTHH:mm" in the browser's local time; empty -> '' */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
