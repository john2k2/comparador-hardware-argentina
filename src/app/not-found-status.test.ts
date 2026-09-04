import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A `loading.tsx` file turns its segment into a Suspense boundary. Next.js then
 * flushes the streamed shell with a `200 OK` status before the page body runs,
 * so a later `notFound()` call can only swap the rendered UI - the status code
 * is already committed. The result is a soft 404: the "not found" screen served
 * with `200`, which search engines index as a thin page.
 *
 * Guard the invariant structurally: no route that can call `notFound()` may sit
 * at or below a segment that owns a `loading.tsx`.
 */

const APP_DIR = path.resolve(__dirname);

function collectPageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const entryPath = path.join(dir, entry);
    if (statSync(entryPath).isDirectory()) {
      return collectPageFiles(entryPath);
    }
    return entry === 'page.tsx' ? [entryPath] : [];
  });
}

function callsNotFound(pagePath: string): boolean {
  return /\bnotFound\s*\(\s*\)/.test(readFileSync(pagePath, 'utf8'));
}

function ancestorSegmentsWithLoading(pagePath: string): string[] {
  const segments: string[] = [];
  let dir = path.dirname(pagePath);

  while (dir.startsWith(APP_DIR)) {
    try {
      statSync(path.join(dir, 'loading.tsx'));
      segments.push(path.relative(APP_DIR, dir) || '.');
    } catch {
      // No loading.tsx in this segment.
    }
    if (dir === APP_DIR) break;
    dir = path.dirname(dir);
  }

  return segments;
}

describe('notFound() routes return a real 404 status', () => {
  const notFoundPages = collectPageFiles(APP_DIR).filter(callsNotFound);

  it('finds the routes that depend on notFound()', () => {
    expect(notFoundPages.length).toBeGreaterThan(0);
  });

  it.each(notFoundPages)('%s has no Suspense boundary above it', (pagePath) => {
    expect(ancestorSegmentsWithLoading(pagePath)).toEqual([]);
  });
});
