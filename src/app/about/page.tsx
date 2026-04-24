import type { Metadata } from 'next';
import Link from 'next/link';
import { RetroPageShell } from '@/components/layout/RetroPageShell';
import { buildPublicPageMetadata } from '@/lib/seo/metadata';
import { SITE_NAME } from '@/lib/site-config';

export const metadata: Metadata = buildPublicPageMetadata({
  path: '/about',
  title: 'About',
  description: `${SITE_NAME} compares hardware offers from Argentine stores with transparent scope, store links and editorial criteria.`,
});

export default function AboutPage() {
  return (
    <RetroPageShell
      title="ABOUT / ACERCA"
      subtitle="English-friendly reference page for crawlers and users looking for the project background."
    >
      <div className="space-y-4 text-[10px] uppercase text-foreground">
        <div className="border-2 border-border bg-muted/30 p-4">
          <h2 className="text-secondary font-bold mb-2">[ PROJECT ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            {SITE_NAME} helps users compare hardware offers from Argentine stores. The site does not sell products or process payments; it organizes catalog data, price references and outbound store links so buyers can validate the final purchase directly with each merchant.
          </p>
        </div>

        <div className="border-2 border-border bg-muted/30 p-4">
          <h2 className="text-secondary font-bold mb-2">[ SPANISH VERSION ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono mb-4">
            The main public explanation lives in Spanish because the product targets Argentina.
          </p>
          <Link href="/acerca" className="pixel-button inline-flex min-h-11 items-center text-[9px]">
            VER ACERCA DEL PROYECTO
          </Link>
        </div>

        <div className="border-2 border-border bg-muted/30 p-4">
          <h2 className="text-secondary font-bold mb-2">[ TRUST MODEL ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            The comparison experience is designed around practical buying checks: identify the product variant, compare stores, review availability and then confirm the final conditions on the merchant website. Prices can change quickly in Argentina, so the site treats every listing as a reference that must be verified before payment.
          </p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono mt-3">
            The project favors clear category pages, honest empty states and visible commercial disclosure. Sponsored links, if enabled, must be labeled, while organic comparison remains focused on comparable products and stores. Feedback about broken links, wrong grouping or impossible values is useful because catalog quality directly affects trust.
          </p>
        </div>

        <div className="border-2 border-border bg-muted/30 p-4">
          <h2 className="text-secondary font-bold mb-2">[ USER BENEFIT ]</h2>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono">
            Users save time by starting from one searchable catalog instead of opening many stores manually. Builders can inspect processors, graphics cards, memory, storage and peripherals with a consistent interface, then leave the site only when they are ready to validate details with the selected shop.
          </p>
          <p className="leading-relaxed normal-case text-[11px] tracking-normal font-mono mt-3">
            This makes the site useful for quick checks, planned upgrades and price monitoring across stores with very different catalogs.
          </p>
        </div>
      </div>
    </RetroPageShell>
  );
}
