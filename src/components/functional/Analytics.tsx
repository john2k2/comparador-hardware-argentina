'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { pageview } from '@/lib/analytics';

export function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstPageViewHandledByBootstrap = useRef(false);
  const search = searchParams.toString();

  useEffect(() => {
    if (!pathname) return;

    if (!firstPageViewHandledByBootstrap.current) {
      firstPageViewHandledByBootstrap.current = true;
      return;
    }

    pageview(search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);

  return null;
}
