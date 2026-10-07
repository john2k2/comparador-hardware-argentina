export type RefreshClaimRpc =
  | 'claim_catalog_feed_refresh'
  | 'claim_catalog_refresh'
  | 'claim_offer_refresh';

export type RefreshClaimPhase = 'shared' | 'rotation' | 'requested';

export type RefreshClaimContext = {
  rpc: RefreshClaimRpc;
  phase: RefreshClaimPhase;
  // Ordinal de la llamada, desde uno; también cuenta respuestas vacías.
  batchIndex: number;
  limit: number;
};

export type RefreshClaimDiagnostic = RefreshClaimContext & {
  elapsedMs: number;
  code: string | null;
};

const PHASE_BY_RPC: Record<RefreshClaimRpc, RefreshClaimPhase> = {
  claim_catalog_feed_refresh: 'shared',
  claim_catalog_refresh: 'rotation',
  claim_offer_refresh: 'requested',
};

function validatedCode(value: unknown): string | null {
  // No interpretamos mensajes ni inferimos un fallo de transporte sin código.
  return typeof value === 'string' && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(value)
    ? value
    : null;
}

function extractCode(error: unknown): string | null {
  try {
    return error !== null && typeof error === 'object'
      ? validatedCode((error as { code?: unknown }).code)
      : null;
  } catch {
    return null;
  }
}

function sanitizeDiagnostic(value: unknown): RefreshClaimDiagnostic | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const candidate = value as Record<string, unknown>;
    const { rpc, phase, batchIndex, limit, elapsedMs } = candidate;
    if (typeof rpc !== 'string' || !Object.hasOwn(PHASE_BY_RPC, rpc)
      || phase !== PHASE_BY_RPC[rpc as RefreshClaimRpc]
      || typeof batchIndex !== 'number' || !Number.isSafeInteger(batchIndex) || batchIndex < 1
      || typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 60
      || typeof elapsedMs !== 'number' || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return null;
    // Reconstruir los campos evita propagar propiedades añadidas al error.
    return { rpc: rpc as RefreshClaimRpc, phase: phase as RefreshClaimPhase,
      batchIndex, limit, elapsedMs, code: validatedCode(candidate.code) };
  } catch {
    return null;
  }
}

export class RefreshClaimError extends Error {
  readonly diagnostic: RefreshClaimDiagnostic | null;

  constructor(diagnostic: unknown) {
    super('REFRESH_CLAIM_FAILED');
    this.name = 'RefreshClaimError';
    this.diagnostic = sanitizeDiagnostic(diagnostic);
  }
}

export function createRefreshClaimError(
  error: unknown,
  context: RefreshClaimContext,
  elapsedMs: number,
): RefreshClaimError {
  return new RefreshClaimError({ rpc: context.rpc, phase: context.phase,
    batchIndex: context.batchIndex, limit: context.limit, elapsedMs, code: extractCode(error) });
}

export function extractRefreshClaimDiagnostic(error: unknown): RefreshClaimDiagnostic | null {
  return error instanceof RefreshClaimError ? sanitizeDiagnostic(error.diagnostic) : null;
}

export type RefreshSeedAttempt = {
  rpc: 'seed_catalog_refresh_queue';
  phase: 'preparation';
  batchIndex: number;
  attemptIndex: number;
  elapsedMs: number;
  code: string | null;
};

export type RefreshSeedDiagnostic = { attempts: RefreshSeedAttempt[] };

export function createRefreshSeedAttempt(
  error: unknown,
  batchIndex: number,
  attemptIndex: number,
  elapsedMs: number,
): RefreshSeedAttempt {
  return { rpc: 'seed_catalog_refresh_queue', phase: 'preparation',
    batchIndex, attemptIndex, elapsedMs, code: extractCode(error) };
}

export function sanitizeRefreshSeedDiagnostic(value: unknown): RefreshSeedDiagnostic | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const { attempts } = value as { attempts?: unknown };
    if (!Array.isArray(attempts) || attempts.length < 1 || attempts.length > 3) return null;
    const safe: RefreshSeedAttempt[] = [];
    for (const candidate of attempts) {
      if (!candidate || typeof candidate !== 'object') return null;
      const { rpc, phase, batchIndex, attemptIndex, elapsedMs, code } = candidate;
      if (rpc !== 'seed_catalog_refresh_queue' || phase !== 'preparation'
        || !Number.isSafeInteger(batchIndex) || batchIndex < 1 || batchIndex > 200
        || !Number.isSafeInteger(attemptIndex) || attemptIndex !== safe.length + 1
        || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0
        || (safe.length > 0 && batchIndex !== safe[0].batchIndex)) return null;
      safe.push({ rpc, phase, batchIndex, attemptIndex, elapsedMs, code: validatedCode(code) });
    }
    return { attempts: safe };
  } catch {
    return null;
  }
}
