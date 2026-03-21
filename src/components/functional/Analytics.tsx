'use client';

import Script from 'next/script';
import { pageview } from '@/lib/analytics/ga4';

const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

interface AnalyticsProps {
  nonce?: string;
}

export function Analytics({ nonce }: AnalyticsProps) {
  if (!GA4_MEASUREMENT_ID) {
    return null;
  }

  return (
    <>
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
      />
      <Script
        nonce={nonce}
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA4_MEASUREMENT_ID}', {
              send_page_view: false,
            });
          `,
        }}
      />
    </>
  );
}

export function trackPageview(url: string) {
  pageview(url);
}

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}
