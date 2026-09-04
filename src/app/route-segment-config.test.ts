import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `export const dynamic = 'force-dynamic'` opts a segment out of caching
 * entirely, which makes any `revalidate` on the same segment dead config: it is
 * never applied, but it reads as if the route were cached. Keeping both is how
 * a route ends up with a caching story nobody can trust.
 *
 * Guard it structurally so the pair cannot reappear.
 */

const APP_DIR = path.resolve(__dirname);

function collectRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const entryPath = path.join(dir, entry);
    if (statSync(entryPath).isDirectory()) {
      return collectRouteFiles(entryPath);
    }
    return entry === 'page.tsx' || entry === 'route.ts' ? [entryPath] : [];
  });
}

function declaresForceDynamicWithRevalidate(filePath: string): boolean {
  const source = readFileSync(filePath, 'utf8');
  const forcesDynamic = /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/.test(source);
  const setsRevalidate = /export\s+const\s+revalidate\s*=/.test(source);
  return forcesDynamic && setsRevalidate;
}

describe('route segment config', () => {
  const routeFiles = collectRouteFiles(APP_DIR);

  it('finds the app routes', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it('never pairs force-dynamic with a revalidate that can never apply', () => {
    const offenders = routeFiles
      .filter(declaresForceDynamicWithRevalidate)
      .map((filePath) => path.relative(APP_DIR, filePath));

    expect(offenders).toEqual([]);
  });
});
