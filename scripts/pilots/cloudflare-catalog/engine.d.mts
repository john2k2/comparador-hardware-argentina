import type { DbCatalogPage } from '../../../src/lib/persistence/product-read-types';

export interface CatalogSqlReader {
  all(sql: string, values?: unknown[]): Promise<Record<string, unknown>[]>;
  first(sql: string, values?: unknown[]): Promise<Record<string, unknown> | undefined>;
  latestFirst?(sql: string, values?: unknown[]): Promise<Record<string, unknown> | undefined>;
}
export interface CatalogSqlParams {
  p_query?: string;
  p_category?: string | null;
  p_stores?: string[];
  p_min_price?: number | null;
  p_max_price?: number | null;
  p_sort?: string;
  p_page?: number;
  p_page_size?: number;
}
export function searchCatalog(db: CatalogSqlReader, input: CatalogSqlParams,
  options?: { now?: number; snapshot?: string; forceOriginal?: boolean; preferCurrentRepresentative?: boolean }): Promise<DbCatalogPage>;
export function validateParams(input?: CatalogSqlParams): Required<CatalogSqlParams>;
export function stableCandidateGuards(input: Required<CatalogSqlParams>,
  prepared: { words: string[]; candidate: string | null; kind: string },
  ids?: string[] | null): { values: unknown[]; guards: string[] };
export const MAX_TEXT_CANDIDATES: number;
export const MAX_TEXT_BATCHES: number;
