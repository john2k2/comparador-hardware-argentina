import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ resolve: { alias: { '@': path.resolve(import.meta.dirname, './candidate/src') } },
  test: { environment: 'node', include: ['tmp/ram-kit-f811/candidate/src/**/*.test.ts'] } });
