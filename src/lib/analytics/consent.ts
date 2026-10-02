export const ANALYTICS_CONSENT_KEY = 'cha-analytics-consent:v1';
export const ANALYTICS_CONSENT_EVENT = 'cha-open-privacy-preferences';
export const ANALYTICS_READY_EVENT = 'cha-analytics-ready';
export const ANALYTICS_CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export type AnalyticsChoice = { allowed: boolean; savedAt: number };

export function parseAnalyticsChoice(raw: string | null, now = Date.now()): AnalyticsChoice | null {
  try {
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value.allowed !== 'boolean' || typeof value.savedAt !== 'number') return null;
    const age = now - value.savedAt;
    return age >= 0 && age < ANALYTICS_CONSENT_MAX_AGE_MS ? value : null;
  } catch { return null; }
}

declare global {
  interface Window {
    __chaAnalyticsAllowed?: boolean;
    __chaAnalyticsMeasurementId?: string;
    __chaApplyAnalyticsChoice?: (allowed: boolean) => void;
  }
}

/** Modo básico: no se solicita gtag.js hasta una elección afirmativa vigente. */
export function buildAnalyticsBootstrap(measurementId: string): string {
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return '';
  return `(function(){
    var id=${JSON.stringify(measurementId)}, key=${JSON.stringify(ANALYTICS_CONSENT_KEY)}, loaded=false;
    var nonce=document.currentScript && document.currentScript.nonce;
    window.dataLayer=window.dataLayer||[];
    window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
    window.__chaAnalyticsAllowed=false;
    window.__chaAnalyticsMeasurementId=id;
    window.gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    window.__chaApplyAnalyticsChoice=function(allowed){
      window.__chaAnalyticsAllowed=allowed===true;
      window['ga-disable-'+id]=!window.__chaAnalyticsAllowed;
      window.gtag('consent','update',{analytics_storage:allowed?'granted':'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
      if(!allowed || loaded) return;
      loaded=true;
      window.gtag('js',new Date());
      window.gtag('config',id,{allow_google_signals:false,allow_ad_personalization_signals:false});
      var script=document.createElement('script');
      script.async=true;
      if(nonce) script.nonce=nonce;
      script.src='https://www.googletagmanager.com/gtag/js?id='+id;
      document.head.appendChild(script);
      window.dispatchEvent(new Event(${JSON.stringify(ANALYTICS_READY_EVENT)}));
    };
    try {
      var value=JSON.parse(window.localStorage.getItem(key));
      var age=value && Date.now()-value.savedAt;
      if(value && value.allowed===true && typeof value.savedAt==='number' && age>=0 && age<${ANALYTICS_CONSENT_MAX_AGE_MS}) window.__chaApplyAnalyticsChoice(true);
    } catch(e) {}
  })();`;
}
