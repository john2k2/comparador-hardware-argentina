'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { pageview } from '@/lib/analytics';

const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

export function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isReady, setIsReady] = useState(false);
  const search = searchParams.toString();

  useEffect(() => {
    if (!isReady || !pathname) return;
    pageview(search ? `${pathname}?${search}` : pathname);
  }, [isReady, pathname, search]);

  if (!GA4_MEASUREMENT_ID) {
    return null;
  }

  return (
    <>
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
        onLoad={() => {
          window.dataLayer = window.dataLayer || [];
          window.gtag = (...args: unknown[]) => window.dataLayer.push(args);
          window.gtag('js', new Date());
          window.gtag('config', GA4_MEASUREMENT_ID, { send_page_view: false });
          setIsReady(true);
        }}
      />
    </>
  );
}

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}
