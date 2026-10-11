import type { DatabaseSync } from 'node:sqlite';

export type RefreshLease = {
  offerId: string;
  productId: string;
  storeId: string;
  url: string;
  observedAt: string | null;
  price: number | null;
  stock?: string | null;
  leaseToken: string;
  leasedAt: number;
  leaseUntil: number;
  attempt: number;
};
export type EnqueueRefreshOptions = {
  productIds: string[];
  now?: number;
  freshMs?: number;
  refreshAheadMs?: number;
  demandTtlMs?: number;
  storeIds?: string[];
  offerIds?: string[];
  withinTransaction?: boolean;
};
export type RefreshReceipt = {
  offerId: string;
  url: string;
  observedAt: string;
  source: 'structured-source' | 'public-page';
  persisted: boolean;
  identityVerified: boolean;
  priceVerified: boolean;
  stockVerified: boolean;
  comparableVerified?: boolean;
};
export type RefreshOutcome = 'observed' | 'http-403' | 'http-429' | 'http-error' |
  'network-error' | 'no-observation' | 'identity-mismatch' | 'persistence-error';
export type RefreshAckOptions = {
  offerId: string;
  leaseToken: string;
  now?: number;
  outcome: RefreshOutcome;
  receipt?: RefreshReceipt;
  retryAfterMs?: number;
  withinTransaction?: boolean;
};
export function offerFromRow(row: Record<string, unknown> | undefined): Pick<RefreshLease, 'offerId' | 'productId' | 'storeId' | 'url' | 'observedAt' | 'price' | 'stock'> | null;
export function initializeRefreshDemand(db: DatabaseSync): void;
export function enqueueKnownProducts(db: DatabaseSync, options: EnqueueRefreshOptions): {
  inserted: number; updated: number; coalesced: number; rejected: number;
  truncated: boolean; offers: string[];
};
export function claimRefreshBatch(db: DatabaseSync, options?: {
  now?: number; limit?: number; leaseMs?: number; storeIds?: string[]; productIds?: string[]; offerIds?: string[];
}): RefreshLease[];
export function acknowledgeRefresh(db: DatabaseSync, options: RefreshAckOptions):
  { status: 'observed'; observedAt: string; comparable: boolean } |
  { status: 'backoff'; dueAt: number; observedAt: string | null };
