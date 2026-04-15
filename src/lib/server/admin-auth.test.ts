import { describe, expect, it, vi } from 'vitest';

// Mockear Supabase ANTES de importar admin-auth
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: vi.fn(() => null),
}));

import { isAdminUser } from './admin-auth';
import type { User } from '@supabase/supabase-js';

describe('admin-auth', () => {
  describe('isAdminUser', () => {
    it('retorna true cuando is_admin es true', () => {
      const user = {
        app_metadata: { is_admin: true },
      } as User;

      expect(isAdminUser(user)).toBe(true);
    });

    it('retorna true cuando role es admin', () => {
      const user = {
        app_metadata: { role: 'admin' },
      } as User;

      expect(isAdminUser(user)).toBe(true);
    });

    it('retorna false para usuario normal', () => {
      const user = {
        app_metadata: { is_admin: false, role: 'user' },
      } as User;

      expect(isAdminUser(user)).toBe(false);
    });

    it('retorna false para user sin app_metadata', () => {
      const user = {
        app_metadata: {},
      } as User;

      expect(isAdminUser(user)).toBe(false);
    });

    it('retorna false para user null', () => {
      expect(isAdminUser(null)).toBe(false);
    });

    it('is_admin tiene prioridad sobre role', () => {
      const user = {
        app_metadata: { is_admin: true, role: 'user' },
      } as User;

      expect(isAdminUser(user)).toBe(true);
    });
  });
});
