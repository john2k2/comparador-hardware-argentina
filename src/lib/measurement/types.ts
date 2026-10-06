export const PROVIDER_IDS = ['ga4', 'search-console', 'cloudflare', 'catalog', 'operations', 'github', 'eneba', 'database', 'adsense', 'google-ads'] as const;
export type ProviderId = typeof PROVIDER_IDS[number];
export type ReadingOrigin = 'api' | 'audit' | 'manual';

export interface MeasurementReading {
  version: 1;
  provider: ProviderId;
  origin: ReadingOrigin;
  collectedAt: string;
  period: { start: string; end: string; timeZone: string };
  metrics: Record<string, number | null>;
  daily?: { date: string; value: number }[];
  breakdown?: { label: string; value: number }[];
  notes: string[];
}

export interface ProviderConnection {
  id: ProviderId;
  state: 'connected' | 'ready' | 'needs_setup' | 'manual' | 'error';
  checkedAt: string | null;
  issue: string | null;
}

export const DECISION_IDS = ['stability', 'catalog', 'measurement', 'connect', 'income'] as const;
export type DecisionId = typeof DECISION_IDS[number];
export type DecisionStatus = 'pending' | 'in_progress' | 'done';
export interface TrackedDecision { id: DecisionId; status: DecisionStatus; updatedAt: string }

export interface MeasurementDashboard {
  generatedAt: string;
  readings: MeasurementReading[];
  history: MeasurementReading[];
  connections: ProviderConnection[];
  decisions: TrackedDecision[];
  storage: { available: boolean; issue: string | null };
  setup: { google: boolean; encryption: boolean; externalCollector?: boolean };
  demo: boolean;
  demoBaselineReal: boolean;
}

export type MeasurementCommand =
  | { action: 'sync'; provider: ProviderId | 'all' }
  | { action: 'decision'; id: DecisionId; status: DecisionStatus };
