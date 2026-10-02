import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DigitalGames } from '@/components/digital-games/DigitalGames';
import { isEnebaPilotEnabled } from '@/lib/eneba/server';
import { SITE_URL } from '@/lib/site-config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Juegos digitales para Argentina',
  description: 'Una selección pequeña de claves digitales de Eneba, con plataforma, restricciones y precios observados en pesos argentinos.',
  alternates: { canonical: `${SITE_URL}/juegos-digitales` },
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function DigitalGamesPage() {
  if (!isEnebaPilotEnabled()) notFound();
  return <DigitalGames />;
}
