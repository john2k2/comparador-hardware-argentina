import { describe, expect, it } from 'vitest';
import { createRefreshClaimError, extractRefreshClaimDiagnostic, RefreshClaimError,
  createRefreshSeedAttempt, sanitizeRefreshSeedDiagnostic, type RefreshClaimContext } from './refresh-diagnostics';

const context: RefreshClaimContext = {
  rpc: 'claim_catalog_refresh', phase: 'rotation', batchIndex: 51, limit: 24,
};

describe('diagnóstico permitido de adquisición', () => {
  it.each(['57014', '40P01', 'PGRST202'])('conserva el código explícito %s sin copiar el error', (code) => {
    const error = createRefreshClaimError({ code, message: 'privado', details: 'SQL', hint: 'token' }, context, 8500);
    expect(error.message).toBe('REFRESH_CLAIM_FAILED');
    expect(extractRefreshClaimDiagnostic(error)).toEqual({ ...context, elapsedMs: 8500, code });
    expect(JSON.stringify(error)).not.toMatch(/privado|SQL|token|details|hint/);
  });

  it.each([undefined, null, false, 0, 57014, '', '57014\n', ' 57014', 'pgrst202', 'NETWORK', 'TOKEN_SECRET', { code: '57014' }])(
    'representa un código ausente o inválido como null: %j', (code) => {
      expect(extractRefreshClaimDiagnostic(createRefreshClaimError({ code }, context, 0))?.code).toBeNull();
    },
  );

  it('no infiere transporte a partir de una excepción sin código', () => {
    const error = createRefreshClaimError(new Error('fetch failed: https://private.invalid/token'), context, 25);
    expect(extractRefreshClaimDiagnostic(error)).toEqual({ ...context, elapsedMs: 25, code: null });
    expect(JSON.stringify(error)).not.toMatch(/fetch|private|token/);
    expect(extractRefreshClaimDiagnostic(new Error('REFRESH_CLAIM_FAILED'))).toBeNull();
  });

  it('descarta campos inyectados en el contexto y vuelve a filtrar al extraer', () => {
    const error = createRefreshClaimError({ code: '57014' }, {
      ...context, token: 'secret-marker', args: { url: 'https://private.invalid' },
    } as RefreshClaimContext, 5);
    Object.assign(error.diagnostic!, { details: 'private SQL', token: 'secret-marker' });
    expect(extractRefreshClaimDiagnostic(error)).toEqual({ ...context, elapsedMs: 5, code: '57014' });
    expect(JSON.stringify(extractRefreshClaimDiagnostic(error))).not.toMatch(/private|secret|token|args/);
  });

  it.each([
    { rpc: 'unknown-secret' }, { phase: 'shared' }, { batchIndex: 0 }, { limit: 61 },
    { limit: false }, { elapsedMs: Infinity }, { elapsedMs: -1 },
  ])('rechaza un contexto inválido sin propagarlo: %j', (override) => {
    const error = new RefreshClaimError({ ...context, elapsedMs: 5, code: '57014', ...override });
    expect(extractRefreshClaimDiagnostic(error)).toBeNull();
    expect(error.message).toBe('REFRESH_CLAIM_FAILED');
  });

  it('un getter defectuoso no expone su excepción', () => {
    const raw = { get code(): never { throw new Error('private SQL'); } };
    expect(extractRefreshClaimDiagnostic(createRefreshClaimError(raw, context, 5))?.code).toBeNull();
  });
});

describe('diagnóstico permitido de preparación', () => {
  it.each(['57014', '40P01', 'PGRST202', undefined, 'SECRET_URL'])('filtra el código seed %j', (code) => {
    const attempt = createRefreshSeedAttempt({ code, message: 'secret-marker', details: 'SQL', hint: 'URL' }, 2, 1, 8000);
    expect(sanitizeRefreshSeedDiagnostic({ attempts: [attempt], token: 'secret-marker' })).toEqual({ attempts: [{
      rpc: 'seed_catalog_refresh_queue', phase: 'preparation', batchIndex: 2, attemptIndex: 1, elapsedMs: 8000,
      code: ['57014', '40P01', 'PGRST202'].includes(code ?? '') ? code : null,
    }] });
    expect(JSON.stringify(attempt)).not.toMatch(/secret-marker|SQL|URL|message|details|hint/);
  });

  it('reconstruye tres intentos sin propiedades externas', () => {
    const attempts = [1, 2, 3].map(index => ({
      ...createRefreshSeedAttempt({ code: '57014' }, 200, index, 8500), args: 'secret-marker',
    }));
    const result = sanitizeRefreshSeedDiagnostic({ attempts });
    expect(result?.attempts).toHaveLength(3);
    expect(JSON.stringify(result)).not.toMatch(/secret-marker|args/);
  });

  it.each([
    {}, { rpc: 'private-url' }, { phase: 'rotation' }, { batchIndex: 0 }, { batchIndex: 201 },
    { attemptIndex: 2 }, { elapsedMs: Infinity }, { elapsedMs: -1 }, { elapsedMs: false },
  ])('rechaza forma o contexto inválidos: %j', (override) => {
    const attempt = createRefreshSeedAttempt(null, 1, 1, 0);
    expect(sanitizeRefreshSeedDiagnostic({ attempts: [Object.keys(override).length ? { ...attempt, ...override } : null] })).toBeNull();
  });

  it('rechaza historial vacío, demasiado largo, mixto o fuera de orden', () => {
    const attempt = createRefreshSeedAttempt(null, 1, 1, 0);
    for (const attempts of [[], [attempt, attempt, attempt, attempt],
      [attempt, { ...attempt, batchIndex: 2, attemptIndex: 2 }], [attempt, attempt]]) {
      expect(sanitizeRefreshSeedDiagnostic({ attempts })).toBeNull();
    }
  });

  it('tolera getters defectuosos sin revelar la excepción', () => {
    const error = { get code(): never { throw new Error('secret-marker'); } };
    expect(createRefreshSeedAttempt(error, 1, 1, 10).code).toBeNull();
    expect(sanitizeRefreshSeedDiagnostic({ get attempts(): never { throw error; } })).toBeNull();
  });
});
