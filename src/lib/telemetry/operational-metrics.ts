export type {
  MonitoredEndpoint,
  ScrapeHealthStatus,
  StoreHealthStatus,
  StoreScrapeEvent,
  EndpointRequestEvent,
  OperationalTelemetryState,
  StoreFailureSnapshot,
  StoreHealthSnapshot,
  EndpointHealthSnapshot,
  OperationalAlert,
  OperationalLogEntry,
  OperationalMetricsSnapshot,
} from '../metrics/types';

export {
  STORE_EVENT_LIMIT,
  ENDPOINT_EVENT_LIMIT,
  SNAPSHOT_WINDOW_MS,
  SLOW_SCRAPE_THRESHOLD_MS,
  PERSISTED_EVENT_TTL_MS,
  STORE_SCOPE,
  ENDPOINT_SCOPE,
} from '../metrics/constants';

export { getState } from '../metrics/state';

export {
  recordStoreScrapeEvent,
  recordEndpointRequestEvent,
  runObservedStoreScrape,
} from '../metrics/recorder';

export { getOperationalMetricsSnapshot } from '../metrics/api';

export {
  buildStoreSnapshots,
  buildEndpointSnapshots,
  buildAlerts,
  buildLogs,
  buildSnapshotFromState,
} from '../metrics/calculator';

export {
  persistTelemetryEntry,
  readPersistedTelemetryState,
  mergeState,
} from '../metrics/storage';

export {
  parseHttpStatus,
  safeErrorMessage,
  classifyError,
  statusFromSuccessfulScrape,
  round,
  percentile,
  toIso,
  storeSuccess,
  isFailureEvent,
  isMonitoredEndpoint,
  isScrapeHealthStatus,
  normalizeStoreEvent,
  normalizeEndpointEvent,
  buildEventKey,
  levelFromStoreStatus,
} from '../metrics/utils';
