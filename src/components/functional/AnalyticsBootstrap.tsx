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

  const measurementId = JSON.stringify(GA4_MEASUREMENT_ID);
  const bootstrap = [
    'window.dataLayer = window.dataLayer || [];',
    'window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};',
    "window.gtag('js', new Date());",
    `window.gtag('config', ${measurementId});`,
  ].join('\n');

  return (
    <>
      <script
        async
        nonce={nonce}
        src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
      />
      <script
        id="ga4-bootstrap"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: bootstrap }}
      />
    </>
  );
}
