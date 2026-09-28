/** Identificadores públicos observados en la cuenta; no son credenciales. */
export const ADSENSE_EDITORIAL_PILOT = {
  enabled: false,
  activation: {
    googleApproved: false,
    privacyReviewed: false,
    navigationReviewed: false,
    autoAdsDisabledVerified: false,
    approvedPaths: [] as readonly string[],
  },
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

export type EditorialAdAuthorization = {
  enabled: boolean;
  googleApproved: boolean;
  privacyReviewed: boolean;
  navigationReviewed: boolean;
  autoAdsDisabledVerified: boolean;
  editorialApproved: boolean;
  contentReady: boolean;
  cspProfile: 'site' | 'adsense';
  nonce: string | undefined;
};

/** Solo el servidor construye este contexto desde configuración revisada; no desde query strings. */
export function getEditorialAdAuthorization(
  pathname: string,
  contentReady: boolean,
  cspProfile: 'site' | 'adsense',
  nonce: string | undefined,
): EditorialAdAuthorization {
  return {
    enabled: ADSENSE_EDITORIAL_PILOT.enabled,
    googleApproved: ADSENSE_EDITORIAL_PILOT.activation.googleApproved,
    privacyReviewed: ADSENSE_EDITORIAL_PILOT.activation.privacyReviewed,
    navigationReviewed: ADSENSE_EDITORIAL_PILOT.activation.navigationReviewed,
    autoAdsDisabledVerified: ADSENSE_EDITORIAL_PILOT.activation.autoAdsDisabledVerified,
    editorialApproved: ADSENSE_EDITORIAL_PILOT.activation.approvedPaths.includes(pathname),
    contentReady, cspProfile, nonce,
  };
}

export function isAdvertisingNonce(nonce: string | undefined): nonce is string {
  return typeof nonce === 'string' && /^[a-f0-9]{32}$/i.test(nonce);
}

export function canBootstrapEditorialAd(pathname: string, context: EditorialAdAuthorization): boolean {
  return context.enabled === true && context.googleApproved === true
    && context.privacyReviewed === true && context.navigationReviewed === true
    && context.autoAdsDisabledVerified === true
    && context.editorialApproved === true && context.contentReady === true
    && context.cspProfile === 'adsense' && isAdvertisingNonce(context.nonce)
    && ADSENSE_EDITORIAL_PILOT.paths.some((path) => path === pathname);
}

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
