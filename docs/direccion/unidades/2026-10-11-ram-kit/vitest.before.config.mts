import { defineConfig } from 'vitest/config';
import path from 'node:path';
const root = import.meta.dirname;
export default defineConfig({ resolve: { alias: [
  { find: '@/lib/persistence/product-read-helpers', replacement: path.resolve(root, './baseline/src/lib/persistence/product-read-helpers.ts') },
  { find: '@/lib/seo/budget-guide-pricing', replacement: path.resolve(root, './baseline/src/lib/seo/budget-guide-pricing.ts') },
  { find: '@', replacement: path.resolve(root, './candidate/src') },
] }, test: { environment: 'node', include: ['tmp/ram-kit-f811/candidate/src/lib/seo/guide-ram-kit-contract.test.ts'] } });
