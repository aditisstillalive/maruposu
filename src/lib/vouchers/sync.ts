// Background voucher work after the till's requests and from the daily cron.
import { runLater } from '@/lib/replica-sync';
import { pullVouchers } from './mirror';
import { processRedemptions } from './redeem';

/** Pull tokoiboek's changes (at most once a minute unless forced) and send due redemptions. Never throws. */
export async function voucherHousekeeping({ force = false, limit }: { force?: boolean; limit?: number } = {}) {
  const pull = await pullVouchers({ force }).catch(error => { console.error('Voucher pull failed:', error); return null; });
  const sent = await processRedemptions({ limit }).catch(error => { console.error('Voucher redemptions failed:', error); return null; });
  return { pull, sent };
}

/** After the response, so payments and polls never wait on tokoiboek. */
export const voucherHousekeepingLater = () => runLater(() => voucherHousekeeping());
