export function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('resource_exhausted') || normalized.includes('quota') || normalized.includes(' 429');
}

export function isModelNotAvailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes('not found') ||
    normalized.includes('unsupported model') ||
    normalized.includes('unknown model') ||
    normalized.includes('invalid model') ||
    normalized.includes('http 404') ||
    normalized.includes('"code":404')
  );
}
