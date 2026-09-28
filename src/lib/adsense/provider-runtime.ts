import { ADSENSE_EDITORIAL_PILOT, canBootstrapEditorialAd, type EditorialAdAuthorization } from './editorial-pilot';
import { canRequestNonPersonalizedAd, resolveTcfAdvertisingDecision, resolveUsAdvertisingDecision, type AdvertisingDecision } from './consent-signals';

type AdQueue = { push(value: Record<string, never>): unknown; pauseAdRequests?: number; requestNonPersonalizedAds?: number };
type TcfApi = (command: string, version: number, callback: (data: unknown, success: boolean) => void, parameter?: number) => void;
type GoogleFc = {
  callbackQueue: { push(value: Record<string, () => void>): unknown };
  usstatesoptout?: { getInitialUsStatesOptOutStatus?: () => number };
  showRevocationMessage?: () => void;
};
type ProviderWindow = Window & { adsbygoogle?: AdQueue; googlefc?: GoogleFc; __tcfapi?: TcfApi };

export type AdRuntimeState = 'blocked' | 'idle' | 'pending' | 'requested' | 'denied' | 'failed' | 'stopped';
export type AdSenseRuntime = {
  getState(): AdRuntimeState;
  allowGoogleBootstrap(): void;
  withdraw(): void;
  openGooglePreferences(): void;
  destroy(): void;
};
const initializedDocuments = new WeakSet<Window>();
const CMP_TIMEOUT_MS = 15_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Cargador preparado: no se invoca desde producción ni sustituye la CMP certificada. */
export function createAdSenseRuntime(options: {
  browserWindow: Window;
  slot: HTMLElement;
  pathname: string;
  authorization: EditorialAdAuthorization;
  onState?: (state: AdRuntimeState) => void;
}): AdSenseRuntime {
  const { browserWindow, slot, pathname, authorization, onState } = options;
  const provider = browserWindow as ProviderWindow;
  const document = browserWindow.document;
  const gpc = () => (browserWindow.navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  const nonce = authorization.nonce;
  const permitted = canBootstrapEditorialAd(pathname, authorization) && !gpc()
    && browserWindow.location.pathname === pathname && slot.ownerDocument === document
    && document.documentElement.getAttribute('data-csp-profile') === 'adsense'
    && document.documentElement.getAttribute('data-csp-pathname') === pathname
    && document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce === nonce;
  let state: AdRuntimeState = permitted ? 'idle' : 'blocked';
  let stopped = !permitted;
  let bootstrapped = false;
  let scriptReady = false;
  let requested = false;
  let eu: AdvertisingDecision = 'unknown';
  let us: AdvertisingDecision = 'unknown';
  let waitingForUser = false;
  let tcfListenerAttached = false;
  let listenerId: number | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function setState(next: AdRuntimeState) { state = next; onState?.(next); }
  function pause() { if (provider.adsbygoogle) provider.adsbygoogle.pauseAdRequests = 1; }
  function stop(next: AdRuntimeState) {
    if (stopped) return;
    stopped = true;
    if (bootstrapped) pause();
    if (timeout !== undefined) clearTimeout(timeout);
    if (listenerId !== undefined) {
      try { provider.__tcfapi?.('removeEventListener', 2, () => undefined, listenerId); } catch { /* Cerrado aunque falle la baja de CMP. */ }
    }
    if (bootstrapped) slot.replaceChildren();
    setState(next);
  }
  function reconcile() {
    if (stopped) return;
    if (browserWindow.location.pathname !== pathname || gpc()) { stop('stopped'); return; }
    pause();
    const consentAllowed = canRequestNonPersonalizedAd(bootstrapped, eu, us);
    if (requested && !consentAllowed) { stop(eu === 'denied' || us === 'denied' ? 'denied' : 'stopped'); return; }
    if (!scriptReady || !consentAllowed) {
      if (eu === 'denied' || us === 'denied') stop('denied');
      if (scriptReady && waitingForUser && us === 'not-applicable' && timeout !== undefined) clearTimeout(timeout);
      return;
    }
    if (requested) { if (provider.adsbygoogle) provider.adsbygoogle.pauseAdRequests = 0; return; }
    const width = slot.getBoundingClientRect().width;
    if (!slot.isConnected || !Number.isFinite(width) || width < ADSENSE_EDITORIAL_PILOT.width) { stop('blocked'); return; }
    const queue = provider.adsbygoogle;
    if (!queue) { stop('failed'); return; }
    const ad = document.createElement('ins');
    ad.className = 'adsbygoogle';
    ad.style.display = 'inline-block';
    ad.style.width = `${ADSENSE_EDITORIAL_PILOT.width}px`;
    ad.style.height = `${ADSENSE_EDITORIAL_PILOT.height}px`;
    ad.setAttribute('data-ad-client', ADSENSE_EDITORIAL_PILOT.publisherId);
    ad.setAttribute('data-ad-slot', ADSENSE_EDITORIAL_PILOT.slotId);
    slot.appendChild(ad);
    requested = true;
    if (timeout !== undefined) clearTimeout(timeout);
    queue.requestNonPersonalizedAds = 1;
    queue.pauseAdRequests = 0;
    try { queue.push({}); setState('requested'); } catch { stop('failed'); }
  }
  function registerCmp() {
    provider.googlefc ??= { callbackQueue: [] };
    provider.googlefc.callbackQueue ??= [];
    provider.googlefc.callbackQueue.push({
      CONSENT_API_READY: () => {
        if (stopped || tcfListenerAttached) return;
        if (!provider.__tcfapi) { stop('failed'); return; }
        tcfListenerAttached = true;
        try {
          provider.__tcfapi('addEventListener', 2, (data, success) => {
            if (stopped) return;
            const id = record(data)?.listenerId;
            if (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) listenerId = id;
            const values = record(data);
            waitingForUser = success === true && values?.gdprApplies === true
              && values.cmpStatus === 'loaded' && values.eventStatus === 'cmpuishown';
            eu = resolveTcfAdvertisingDecision(data, success);
            reconcile();
          });
        } catch { stop('failed'); }
      },
    });
    provider.googlefc.callbackQueue.push({
      INITIAL_US_STATES_OPT_OUT_DATA_READY: () => {
        if (stopped) return;
        try {
          us = resolveUsAdvertisingDecision(provider.googlefc?.usstatesoptout?.getInitialUsStatesOptOutStatus?.());
          reconcile();
        } catch { stop('failed'); }
      },
    });
  }

  return {
    getState: () => state,
    allowGoogleBootstrap() {
      if (stopped || bootstrapped) return;
      const width = slot.getBoundingClientRect().width;
      if (gpc() || browserWindow.location.pathname !== pathname || !slot.isConnected || !Number.isFinite(width) || width < ADSENSE_EDITORIAL_PILOT.width
        || initializedDocuments.has(browserWindow) || document.getElementById('cha-adsense-provider')
        || provider.adsbygoogle !== undefined) { stop('blocked'); return; }
      bootstrapped = true;
      initializedDocuments.add(browserWindow);
      provider.adsbygoogle ??= [];
      provider.adsbygoogle.pauseAdRequests = 1;
      provider.adsbygoogle.requestNonPersonalizedAds = 1;
      setState('pending');
      timeout = setTimeout(() => stop('failed'), CMP_TIMEOUT_MS);
      const script = document.createElement('script');
      script.id = 'cha-adsense-provider';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.nonce = nonce!;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_EDITORIAL_PILOT.publisherId}`;
      script.onload = () => { if (!stopped) { scriptReady = true; reconcile(); } };
      script.onerror = () => stop('failed');
      try { registerCmp(); } catch { stop('failed'); }
      if (!stopped) document.head.appendChild(script);
    },
    withdraw() { stop('denied'); },
    openGooglePreferences() {
      if (stopped || !bootstrapped) return;
      pause();
      eu = 'unknown';
      slot.replaceChildren();
      // Cerrar antes de abrir la CMP evita reactivar el espacio desde callbacks síncronos.
      stop('stopped');
      try { provider.googlefc?.callbackQueue.push({ CONSENT_API_READY: () => provider.googlefc?.showRevocationMessage?.() }); }
      catch { /* El espacio ya está cerrado aunque la CMP no pueda abrirse. */ }
      // Una elección posterior requiere un documento nuevo, no otra impresión en esta vista.
    },
    destroy() { stop('stopped'); },
  };
}
