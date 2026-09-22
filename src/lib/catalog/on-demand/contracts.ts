export type RefreshTarget = { productId: string; storeId: string; url: string };
export type RefreshItemResult = RefreshTarget & { state: 'updated' | 'unavailable' | 'failed'; observedAt: string | null };
export type RefreshJob = {
  id: string; status: 'queued' | 'running' | 'completed' | 'partial' | 'failed'; targets: RefreshTarget[];
  results: RefreshItemResult[]; created_at: string; started_at: string | null; finished_at: string | null; expires_at: string;
};
export const JOB_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function parseRefreshTargets(value: unknown): RefreshTarget[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null;
  const targets: RefreshTarget[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.productId !== 'string' || !/^[\w.-]{1,240}$/.test(item.productId)
      || typeof item.storeId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(item.storeId) || typeof item.url !== 'string' || item.url.length > 2048) return null;
    try { const url = new URL(item.url); if (url.protocol !== 'https:' || url.username || url.password) return null; } catch { return null; }
    targets.push({ productId: item.productId, storeId: item.storeId, url: item.url });
  }
  return [...new Map(targets.map((target) => [JSON.stringify(target), target])).values()];
}
export async function readSmallJson(request: Request, maxBytes = 24_000): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_BODY');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw new Error('BODY_TOO_LARGE');
      chunks.push(part.value);
    }
    const body = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(body));
  } finally { await reader.cancel().catch(() => undefined); }
}
