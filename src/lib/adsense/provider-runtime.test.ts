import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdSenseRuntime, type AdRuntimeState } from './provider-runtime';
import type { EditorialAdAuthorization } from './editorial-pilot';

const PATHNAME = '/guia/pc-gamer-2-millones';
const NONCE = '0123456789abcdef0123456789abcdef';

const allowedTcData = {
  gdprApplies: true,
  cmpStatus: 'loaded',
  eventStatus: 'useractioncomplete',
  isServiceSpecific: true,
  tcString: 'TC_Example.fixture',
  purpose: {
    consents: { '1': true },
    legitimateInterests: { '2': true, '7': true, '9': true, '10': true },
  },
  vendor: {
    consents: { '755': true },
    legitimateInterests: { '755': true },
    disclosedVendors: { '755': true },
  },
  publisher: { restrictions: {} },
};

type FakeScript = {
  id?: string;
  nonce: string;
  onload?: () => void;
  onerror?: () => void;
};

type TcfCallback = (data: unknown, success: boolean) => void;

type Harness = {
  browserWindow: Window;
  slot: HTMLElement;
  location: { pathname: string };
  appendedScripts: FakeScript[];
  callbackQueue: Array<Record<string, () => void>>;
  queuePushes: Array<Record<string, never>>;
  tcfCallbacks: TcfCallback[];
  tcfCalls: Array<{ command: string; parameter?: number }>;
  children: unknown[];
  usStatus: { value: number | undefined };
  showRevocationMessage: ReturnType<typeof vi.fn>;
  authorization: EditorialAdAuthorization;
};

type HarnessOptions = {
  pathname?: string;
  gpc?: boolean;
  cmpPresent?: boolean;
  usStatus?: number;
  documentProfile?: string;
  preexistingAdsbygoogle?: boolean;
  authorization?: Partial<EditorialAdAuthorization>;
};

function createHarness(options: HarnessOptions = {}): Harness {
  const pathname = options.pathname ?? PATHNAME;
  const location = { pathname };
  const attributes: Record<string, string> = {
    'data-csp-profile': options.documentProfile ?? 'adsense',
    'data-csp-pathname': pathname,
  };
  const cspScript: FakeScript = { nonce: NONCE };
  const appendedScripts: FakeScript[] = [];
  const callbackQueue: Array<Record<string, () => void>> = [];
  const queuePushes: Array<Record<string, never>> = [];
  const tcfCallbacks: TcfCallback[] = [];
  const tcfCalls: Array<{ command: string; parameter?: number }> = [];
  const children: unknown[] = [];
  const usStatus = { value: options.usStatus ?? 1 };
  const showRevocationMessage = vi.fn();

  const document = {
    documentElement: {
      getAttribute: (name: string) => attributes[name] ?? null,
    },
    querySelector: () => cspScript,
    getElementById: (id: string) => appendedScripts.find((script) => script.id === id) ?? null,
    head: {
      appendChild: (node: FakeScript) => {
        appendedScripts.push(node);
        return node;
      },
    },
    createElement: (tag: string) => {
      if (tag === 'script') return { nonce: '', onload: undefined, onerror: undefined } as FakeScript;
      return {
        className: '',
        style: { display: '', width: '', height: '' },
        setAttribute: vi.fn(),
      };
    },
  } as unknown as Document;

  const slot = {
    ownerDocument: document,
    isConnected: true,
    getBoundingClientRect: () => ({ width: 300 }),
    appendChild: (node: unknown) => {
      children.push(node);
      return node;
    },
    replaceChildren: (...nodes: unknown[]) => {
      children.splice(0, children.length, ...nodes);
    },
  } as unknown as HTMLElement;

  const initialAdsbygoogle = options.preexistingAdsbygoogle ? {
    push: (value: Record<string, never>) => {
      queuePushes.push(value);
      return queuePushes.length;
    },
  } : undefined;
  const googlefc = {
    callbackQueue: {
      push: (value: Record<string, () => void>) => {
        callbackQueue.push(value);
        return callbackQueue.length;
      },
    },
    usstatesoptout: { getInitialUsStatesOptOutStatus: () => usStatus.value },
    showRevocationMessage,
  };
  const tcfApi = options.cmpPresent === false
    ? undefined
    : (command: string, _version: number, callback: TcfCallback, parameter?: number) => {
      tcfCalls.push({ command, parameter });
      if (command === 'addEventListener') tcfCallbacks.push(callback);
    };
  const browserWindowObject = {
    document,
    location,
    navigator: { globalPrivacyControl: options.gpc === true },
    googlefc,
    __tcfapi: tcfApi,
  } as Record<string, unknown>;
  let adsbygoogle = initialAdsbygoogle as { push(value: Record<string, never>): unknown; pauseAdRequests?: number; requestNonPersonalizedAds?: number } | undefined;
  Object.defineProperty(browserWindowObject, 'adsbygoogle', {
    configurable: true,
    get: () => adsbygoogle,
    set: (value: unknown) => {
      const queue = value as { push(value: Record<string, never>): unknown; pauseAdRequests?: number; requestNonPersonalizedAds?: number };
      const originalPush = queue.push.bind(queue);
      queue.push = (entry: Record<string, never>) => {
        queuePushes.push(entry);
        return originalPush(entry);
      };
      adsbygoogle = queue;
    },
  });
  const browserWindow = browserWindowObject as unknown as Window;

  const authorization: EditorialAdAuthorization = {
    enabled: true,
    googleApproved: true,
    privacyReviewed: true,
    navigationReviewed: true,
    autoAdsDisabledVerified: true,
    editorialApproved: true,
    contentReady: true,
    cspProfile: 'adsense',
    nonce: NONCE,
    ...options.authorization,
  };

  return {
    browserWindow,
    slot,
    location,
    appendedScripts,
    callbackQueue,
    queuePushes,
    tcfCallbacks,
    tcfCalls,
    children,
    usStatus,
    showRevocationMessage,
    authorization,
  };
}

function runtimeFor(harness: Harness, onState?: (state: AdRuntimeState) => void) {
  return createAdSenseRuntime({
    browserWindow: harness.browserWindow,
    slot: harness.slot,
    pathname: harness.location.pathname,
    authorization: harness.authorization,
    onState,
  });
}

function callbackEntry(harness: Harness, key: string, latest = false): () => void {
  const matches = harness.callbackQueue.filter((candidate) => key in candidate);
  const entry = matches[latest ? matches.length - 1 : 0];
  if (!entry) throw new Error(`missing callback ${key}`);
  return entry[key] as () => void;
}

function loadProviderScript(harness: Harness) {
  harness.appendedScripts[0]?.onload?.();
}

function emitEu(harness: Harness, data: unknown, success = true) {
  const callback = harness.tcfCallbacks[harness.tcfCallbacks.length - 1];
  if (!callback) throw new Error('missing TCF callback');
  callback(data, success);
}

function authorizeOutsideEu(harness: Harness) {
  callbackEntry(harness, 'CONSENT_API_READY')();
  callbackEntry(harness, 'INITIAL_US_STATES_OPT_OUT_DATA_READY')();
  emitEu(harness, { gdprApplies: false });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('runtime del proveedor AdSense', () => {
  it('no agrega el script antes de allowGoogleBootstrap y registra callbacks de una clave', () => {
    const harness = createHarness();
    const runtime = runtimeFor(harness);

    expect(harness.appendedScripts).toHaveLength(0);
    runtime.allowGoogleBootstrap();

    expect(harness.appendedScripts).toHaveLength(1);
    expect(runtime.getState()).toBe('pending');
    expect(harness.appendedScripts[0]?.nonce).toBe(NONCE);
    expect(harness.callbackQueue).toHaveLength(2);
    expect(harness.callbackQueue.every((entry) => Object.keys(entry).length === 1)).toBe(true);
    runtime.destroy();
  });

  it.each([
    ['configuración cerrada', { authorization: { enabled: false } }],
    ['nonce ausente', { authorization: { nonce: undefined } }],
    ['perfil CSP incorrecto', { authorization: { cspProfile: 'site' as const } }],
    ['documento sin perfil publicitario', { documentProfile: 'site' }],
    ['ruta privada', { pathname: '/admin' }],
    ['Global Privacy Control', { gpc: true }],
  ] as Array<[string, HarnessOptions]>)('bloquea la carga cuando falla una puerta: %s', (_label, options) => {
    const harness = createHarness(options);
    const runtime = runtimeFor(harness);

    runtime.allowGoogleBootstrap();

    expect(runtime.getState()).toBe('blocked');
    expect(harness.appendedScripts).toHaveLength(0);
  });

  it('mantiene una sola carga por Window y no pausa ni vacía al primer runtime', () => {
    const harness = createHarness();
    const first = runtimeFor(harness);
    first.allowGoogleBootstrap();
    loadProviderScript(harness);
    authorizeOutsideEu(harness);
    const firstScript = harness.appendedScripts[0];
    const firstPause = (harness.browserWindow as Window & { adsbygoogle: { pauseAdRequests?: number } }).adsbygoogle.pauseAdRequests;

    const second = runtimeFor(harness);
    second.allowGoogleBootstrap();

    expect(harness.appendedScripts).toHaveLength(1);
    expect(second.getState()).toBe('blocked');
    expect(first.getState()).toBe('requested');
    expect(firstScript).toBe(harness.appendedScripts[0]);
    expect((harness.browserWindow as Window & { adsbygoogle: { pauseAdRequests?: number } }).adsbygoogle.pauseAdRequests).toBe(firstPause);
    expect(harness.children).toHaveLength(1);
    expect(harness.queuePushes).toHaveLength(1);
    first.destroy();
  });

  it('rechaza globals del proveedor preexistentes sin reemplazarlos', () => {
    const harness = createHarness({ preexistingAdsbygoogle: true });
    const originalQueue = (harness.browserWindow as Window & { adsbygoogle: unknown }).adsbygoogle;
    const runtime = runtimeFor(harness);

    runtime.allowGoogleBootstrap();

    expect(runtime.getState()).toBe('blocked');
    expect(harness.browserWindow).toHaveProperty('adsbygoogle', originalQueue);
    expect(harness.appendedScripts).toHaveLength(0);
  });

  it('deja la cola pausada y marca NPA antes de recibir consentimiento', () => {
    const harness = createHarness();
    const runtime = runtimeFor(harness);
    runtime.allowGoogleBootstrap();

    const queue = (harness.browserWindow as Window & { adsbygoogle: { pauseAdRequests?: number; requestNonPersonalizedAds?: number } }).adsbygoogle;
    expect(queue.pauseAdRequests).toBe(1);
    expect(queue.requestNonPersonalizedAds).toBe(1);
    expect(harness.queuePushes).toHaveLength(0);
    runtime.destroy();
  });

  it.each([
    ['slot más angosto', (slot: { getBoundingClientRect: () => { width: number }; isConnected: boolean }) => { slot.getBoundingClientRect = () => ({ width: 299 }); }],
    ['slot desconectado', (slot: { getBoundingClientRect: () => { width: number }; isConnected: boolean }) => { slot.isConnected = false; }],
  ] as Array<[string, (slot: { getBoundingClientRect: () => { width: number }; isConnected: boolean }) => void]>)('vuelve a validar el slot durante CMP y no solicita si deja de ser utilizable: %s', (_label, mutateSlot) => {
    const harness = createHarness();
    const runtime = runtimeFor(harness);
    runtime.allowGoogleBootstrap();
    loadProviderScript(harness);
    mutateSlot(harness.slot as unknown as { getBoundingClientRect: () => { width: number }; isConnected: boolean });
    authorizeOutsideEu(harness);

    expect(harness.queuePushes).toHaveLength(0);
    expect(runtime.getState()).toBe('blocked');
  });

  it('solicita un solo anuncio después de onload, EU no aplicable y US 1', () => {
    const harness = createHarness();
    const runtime = runtimeFor(harness);
    runtime.allowGoogleBootstrap();
    loadProviderScript(harness);
    authorizeOutsideEu(harness);

    expect(harness.queuePushes).toHaveLength(1);
    expect(harness.children).toHaveLength(1);
    expect(runtime.getState()).toBe('requested');
    callbackEntry(harness, 'CONSENT_API_READY')();
    expect(harness.tcfCallbacks).toHaveLength(1);
    callbackEntry(harness, 'INITIAL_US_STATES_OPT_OUT_DATA_READY')();
    emitEu(harness, { gdprApplies: false });
    expect(harness.queuePushes).toHaveLength(1);
    runtime.destroy();
  });

  it('espera el script aunque las dos señales regionales ya estén listas', () => {
    const harness = createHarness();
    const runtime = runtimeFor(harness);
    runtime.allowGoogleBootstrap();
    authorizeOutsideEu(harness);
    expect(harness.queuePushes).toHaveLength(0);
    loadProviderScript(harness);
    expect(harness.queuePushes).toHaveLength(1);
    runtime.destroy();
  });

  it.each([
    ['US 2', 2],
    ['US 3', 3],
  ])('no solicita anuncios con %s', (_label, usStatus) => {
    const harness = createHarness({ usStatus });
    const runtime = runtimeFor(harness);
    runtime.allowGoogleBootstrap();
    loadProviderScript(harness);
    authorizeOutsideEu(harness);

    expect(harness.queuePushes).toHaveLength(0);
    expect(runtime.getState()).toBe('denied');
  });

  it('falla sin CMP, ante error del script o al vencer el timeout de 15 segundos', () => {
    const withoutCmp = createHarness({ cmpPresent: false });
    const noCmpRuntime = runtimeFor(withoutCmp);
    noCmpRuntime.allowGoogleBootstrap();
    loadProviderScript(withoutCmp);
    callbackEntry(withoutCmp, 'CONSENT_API_READY')();
    expect(withoutCmp.queuePushes).toHaveLength(0);
    expect(noCmpRuntime.getState()).toBe('failed');

    const scriptError = createHarness();
    const errorRuntime = runtimeFor(scriptError);
    errorRuntime.allowGoogleBootstrap();
    scriptError.appendedScripts[0]?.onerror?.();
    expect(scriptError.queuePushes).toHaveLength(0);
    expect(errorRuntime.getState()).toBe('failed');

    vi.useFakeTimers();
    const timedOut = createHarness();
    const timeoutRuntime = runtimeFor(timedOut);
    timeoutRuntime.allowGoogleBootstrap();
    vi.advanceTimersByTime(15_000);
    expect(timedOut.queuePushes).toHaveLength(0);
    expect(timeoutRuntime.getState()).toBe('failed');
  });

  it('mantiene cmpuishown abierto más de 15 segundos y luego solicita tras una aprobación válida', () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const runtime = runtimeFor(harness);
    runtime.allowGoogleBootstrap();
    loadProviderScript(harness);
    callbackEntry(harness, 'CONSENT_API_READY')();
    callbackEntry(harness, 'INITIAL_US_STATES_OPT_OUT_DATA_READY')();
    emitEu(harness, {
      ...allowedTcData,
      eventStatus: 'cmpuishown',
      listenerId: 41,
    });

    vi.advanceTimersByTime(15_001);
    expect(harness.queuePushes).toHaveLength(0);
    expect(runtime.getState()).toBe('pending');
    emitEu(harness, { ...allowedTcData, listenerId: 41 });
    expect(harness.queuePushes).toHaveLength(1);
    expect(runtime.getState()).toBe('requested');
    runtime.destroy();
  });

  it('pausa, limpia y desregistra al retirar consentimiento; callbacks tardíos no reactivan solicitudes', () => {
    const harness = createHarness();
    const runtime = runtimeFor(harness);
    runtime.allowGoogleBootstrap();
    loadProviderScript(harness);
    authorizeOutsideEu(harness);
    emitEu(harness, { ...allowedTcData, listenerId: 77 });
    expect(harness.queuePushes).toHaveLength(1);

    runtime.withdraw();

    expect(runtime.getState()).toBe('denied');
    expect(harness.children).toHaveLength(0);
    expect((harness.browserWindow as Window & { adsbygoogle: { pauseAdRequests?: number } }).adsbygoogle.pauseAdRequests).toBe(1);
    expect(harness.tcfCalls).toContainEqual({ command: 'removeEventListener', parameter: 77 });
    emitEu(harness, { ...allowedTcData, listenerId: 77 });
    callbackEntry(harness, 'INITIAL_US_STATES_OPT_OUT_DATA_READY')();
    expect(harness.queuePushes).toHaveLength(1);
  });

  it('bloquea si cambia la ruta entre carga y consentimiento', () => {
    const harness = createHarness();
    const runtime = runtimeFor(harness);
    runtime.allowGoogleBootstrap();
    loadProviderScript(harness);
    harness.location.pathname = '/otra-ruta';
    authorizeOutsideEu(harness);

    expect(runtime.getState()).toBe('stopped');
    expect(harness.queuePushes).toHaveLength(0);
  });

  it('detiene destroy y preferencias, y las preferencias muestran la revocación', () => {
    const destroyed = createHarness();
    const destroyedRuntime = runtimeFor(destroyed);
    destroyedRuntime.allowGoogleBootstrap();
    destroyedRuntime.destroy();
    loadProviderScript(destroyed);
    expect(destroyed.queuePushes).toHaveLength(0);
    expect(destroyedRuntime.getState()).toBe('stopped');

    const preferences = createHarness();
    const preferencesRuntime = runtimeFor(preferences);
    preferencesRuntime.allowGoogleBootstrap();
    loadProviderScript(preferences);
    authorizeOutsideEu(preferences);
    preferencesRuntime.openGooglePreferences();

    expect(preferencesRuntime.getState()).toBe('stopped');
    expect(preferences.children).toHaveLength(0);
    expect((preferences.browserWindow as Window & { adsbygoogle: { pauseAdRequests?: number } }).adsbygoogle.pauseAdRequests).toBe(1);
    callbackEntry(preferences, 'CONSENT_API_READY', true)();
    expect(preferences.showRevocationMessage).toHaveBeenCalledOnce();
    expect(preferences.queuePushes).toHaveLength(1);
  });
});
