import { buildAnalyticsBootstrap } from '@/lib/analytics/consent';

const rawMeasurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() ?? '';
const GA4_MEASUREMENT_ID = /^G-[A-Z0-9]+$/.test(rawMeasurementId)
  ? rawMeasurementId
  : null;

type AnalyticsBootstrapProps = {
  nonce?: string;
};

/**
 * Inicializa la cola de GA4 desde el HTML inicial. Esto mantiene la medición
 * disponible aunque otro componente cliente falle antes de hidratarse.
 */
export function AnalyticsBootstrap({ nonce }: AnalyticsBootstrapProps) {
  if (!GA4_MEASUREMENT_ID) return null;

  const bootstrap = buildAnalyticsBootstrap(GA4_MEASUREMENT_ID);

  return (
    <>
      <script
        id="ga4-bootstrap"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: bootstrap }}
      />
    </>
  );
}
