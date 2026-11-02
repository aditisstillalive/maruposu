'use client';

import { Analytics as VercelAnalytics } from '@vercel/analytics/next';
import { maskUrl } from '@/lib/analytics';

/** Vercel Web Analytics with QR tokens and order ids masked out of the URLs. */
export default function Analytics() {
  return <VercelAnalytics beforeSend={event => ({ ...event, url: maskUrl(event.url) })} />;
}
