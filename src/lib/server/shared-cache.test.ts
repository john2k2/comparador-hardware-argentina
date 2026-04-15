import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mockear Supabase ANTES de importar el modulo
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: vi.fn(() => null),
}));

import { getSharedCache, setSharedCache, deleteSharedCache } from './shared-cache';

describe('shared-cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getSharedCache / setSharedCache', () => {
    it('almacena y recupera un valor', async () => {
      const testData = { foo: 'bar', count: 42 };
      await setSharedCache('test-scope', 'my-key', testData, 60_000);

      const cached = await getSharedCache('test-scope', 'my-key');

      expect(cached).toEqual(testData);
    });

    it('retorna undefined para clave inexistente', async () => {
      const cached = await getSharedCache('test-scope', 'non-existent-key');
      expect(cached).toBeUndefined();
    });

    it('expira correctamente despues del TTL', async () => {
      const testData = { value: 'expiring' };
      await setSharedCache('test-scope', 'expiring-key', testData, 5_000); // 5s TTL

      // Antes de expirar
      const before = await getSharedCache('test-scope', 'expiring-key');
      expect(before).toEqual(testData);

      // Avanzar mas alla del TTL
      vi.advanceTimersByTime(6_000);

      // Deberia estar expirado
      const after = await getSharedCache('test-scope', 'expiring-key');
      expect(after).toBeUndefined();
    });

    it('scopes diferentes no colisionan', async () => {
      const data1 = { scope: 'scope-a' };
      const data2 = { scope: 'scope-b' };

      await setSharedCache('scope-a', 'shared-key', data1, 60_000);
      await setSharedCache('scope-b', 'shared-key', data2, 60_000);

      const resultA = await getSharedCache('scope-a', 'shared-key');
      const resultB = await getSharedCache('scope-b', 'shared-key');

      expect(resultA).toEqual(data1);
      expect(resultB).toEqual(data2);
    });

    it('overwrite actualiza un valor existente', async () => {
      await setSharedCache('test-scope', 'overwrite-key', { version: 1 }, 60_000);
      await setSharedCache('test-scope', 'overwrite-key', { version: 2 }, 60_000);

      const cached = await getSharedCache('test-scope', 'overwrite-key');
      expect(cached).toEqual({ version: 2 });
    });

    it('maneja TTL de 0 (expiracion inmediata)', async () => {
      await setSharedCache('test-scope', 'zero-ttl-key', { data: 'test' }, 0);

      // Deberia estar expirado inmediatamente
      const cached = await getSharedCache('test-scope', 'zero-ttl-key');
      expect(cached).toBeUndefined();
    });

    it('almacena tipos complejos', async () => {
      const complexData = {
        products: [
          { id: 'p1', name: 'Ryzen 5600X', prices: [{ storeId: 'mexx', price: 250_000 }] },
          { id: 'p2', name: 'RTX 4070', prices: [{ storeId: 'venex', price: 500_000 }] },
        ],
        pagination: { total: 100, page: 1 },
        timestamp: new Date().toISOString(),
      };

      await setSharedCache('complex-scope', 'complex-key', complexData, 60_000);
      const cached = await getSharedCache('complex-scope', 'complex-key');

      expect(cached).toEqual(complexData);
    });
  });

  describe('deleteSharedCache', () => {
    it('elimina una clave existente', async () => {
      await setSharedCache('delete-scope', 'delete-me', { data: 'test' }, 60_000);

      // Verificar que existe
      const before = await getSharedCache('delete-scope', 'delete-me');
      expect(before).not.toBeUndefined();

      // Eliminar
      await deleteSharedCache('delete-scope', 'delete-me');

      // Verificar que fue eliminada
      const after = await getSharedCache('delete-scope', 'delete-me');
      expect(after).toBeUndefined();
    });

    it('eliminar clave inexistente no falla', async () => {
      await expect(deleteSharedCache('delete-scope', 'does-not-exist')).resolves.not.toThrow();
    });

    it('eliminar en scope diferente no afecta otras claves', async () => {
      await setSharedCache('scope-a', 'shared-key', { scope: 'a' }, 60_000);
      await setSharedCache('scope-b', 'shared-key', { scope: 'b' }, 60_000);

      await deleteSharedCache('scope-a', 'shared-key');

      const resultA = await getSharedCache('scope-a', 'shared-key');
      const resultB = await getSharedCache('scope-b', 'shared-key');

      expect(resultA).toBeUndefined();
      expect(resultB).toEqual({ scope: 'b' });
    });
  });

  describe('edge cases', () => {
    it('maneja valores grandes', async () => {
      const largeData = { items: Array.from({ length: 1000 }, (_, i) => ({ id: i })) };
      await setSharedCache('large-scope', 'large-key', largeData, 60_000);

      const cached = await getSharedCache('large-scope', 'large-key');
      expect(cached?.items).toHaveLength(1000);
    });

    it('maneja caracteres especiales en claves', async () => {
      const specialKey = 'key-with-unicode-ñ-中文-🎮';
      await setSharedCache('special-scope', specialKey, { data: 'test' }, 60_000);

      const cached = await getSharedCache('special-scope', specialKey);
      expect(cached).toEqual({ data: 'test' });
    });

    it('TTL largo no expira pronto', async () => {
      await setSharedCache('long-scope', 'long-key', { data: 'persistent' }, 365 * 24 * 60 * 60 * 1000); // 1 año

      const cached = await getSharedCache('long-scope', 'long-key');
      expect(cached).toEqual({ data: 'persistent' });
    });
  });
});
