/** Identificadores públicos observados en la cuenta; no son credenciales. */
export const ADSENSE_EDITORIAL_PILOT = {
  enabled: false,
  publisherId: 'ca-pub-4559843439616138',
  slotId: '5184718883',
  width: 300,
  height: 250,
  paths: [
    '/guia/pc-gamer-2-millones',
    '/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x',
    '/comparativa/rtx-4060-vs-rx-7600',
  ],
} as const;

type PreviewContext = {
  nodeEnv: string | undefined;
  previewRequested: string | undefined;
  contentReady: boolean;
};

/** La maqueta local no autoriza publicidad ni interpreta consentimiento GA4. */
export function canPreviewEditorialAd(pathname: string, context: PreviewContext): boolean {
  return context.nodeEnv === 'development'
    && context.previewRequested === '1'
    && context.contentReady
    && ADSENSE_EDITORIAL_PILOT.paths.some((path) => path === pathname);
}
