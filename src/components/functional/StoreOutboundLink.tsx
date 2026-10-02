'use client';

import type { ReactNode } from 'react';
import { trackStoreClick } from '@/lib/analytics/ga4';

export function StoreOutboundLink({ children, className, ariaLabel, tracking }: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  tracking: Parameters<typeof trackStoreClick>[0];
}) {
  return <a href={tracking.destinationUrl} target="_blank" rel="noopener noreferrer" className={className}
    aria-label={ariaLabel} onClick={() => trackStoreClick(tracking)}>{children}</a>;
}
