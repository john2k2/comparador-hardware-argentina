import { defineConfig } from 'vitest/config';
import path from 'node:path';
const source = '/Users/johnortiz/Documents/Codex/2026-10-02/new-chat/outputs/control-2026-10-12/baseline-d108';
export default defineConfig({
  resolve: { alias: [
    { find: '@/lib/persistence/product-read-helpers', replacement: path.join(source, 'product-read-helpers.ts') },
    { find: '@/lib/seo/budget-guide-pricing', replacement: path.join(source, 'budget-guide-pricing.ts') },
    { find: '@', replacement: path.resolve('src') },
  ] },
  test: { environment: 'node', include: ['src/lib/seo/guide-ram-kit-contract.test.ts'] },
});
