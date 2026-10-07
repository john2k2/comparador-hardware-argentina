import { describe, expect, it } from 'vitest';
import { createRefreshClaimError, extractRefreshClaimDiagnostic, RefreshClaimError, type RefreshClaimContext } from './refresh-diagnostics';

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
