import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// Ejecutar la expresión real del workflow: la regresión estaba en su guarda,
// antes del productor TS, y no se reproduce llamando solamente al guardado.
const workflow = readFileSync('.github/workflows/catalog-refresh.yml', 'utf8');
const condition = workflow.match(/- name: Guardar selección pública después de actualizar ofertas\s+if: (.+)/)![1];
function shouldSave(outcome: string, mode = 'guides', status = '', cancelled = false) {
  return runInNewContext(condition.replace(/^\$\{\{\s*|\s*\}\}$/g, ''), {
    always: () => true, cancelled: () => cancelled, success: () => outcome === 'success',
    steps: { refresh: { outcome, outputs: { status } }, resolve: { outputs: { mode } } },
  });
}

describe('productor de portada independiente de la cobertura de guías', () => {
  it('guarda el corte de catálogo aun cuando una pieza falla con attempted=1/observed=0', () => {
    expect(shouldSave('failure')).toBe(true);
  });
  it.each(['guides', 'priority'])('guarda después de un refresh exitoso %s', mode => {
    expect(shouldSave('success', mode, 'completed')).toBe(true);
  });
  it.each([
    ['skipped', 'guides', '', false], ['success', 'guides', 'deferred', false],
    ['failure', 'guides', '', true], ['success', 'cleanup-history', '', false],
    ['success', 'tracked', '', false],
  ])('no guarda para outcome=%s modo=%s status=%s cancelado=%s', (outcome, mode, status, cancelled) => {
    expect(shouldSave(outcome, mode, status, cancelled)).toBe(false);
  });
});
