export interface ScrapingError {
  code: 'NETWORK_ERROR' | 'PARSE_ERROR' | 'TIMEOUT' | 'UNKNOWN';
  message: string;
  url?: string;
  timestamp: number;
}

export interface ScraperResult<T> {
  data: T[];
  error: ScrapingError | null;
  duration: number;
}

export function ok<T>(data: T[], duration: number): ScraperResult<T> {
  return { data, error: null, duration };
}

export function fail<T>(error: ScrapingError, duration: number): ScraperResult<T> {
  return { data: [], error, duration };
}

export function getErrorCode(error: unknown): ScrapingError['code'] {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'TIMEOUT';
    if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('ECONNREFUSED')) return 'NETWORK_ERROR';
    if (error.message.includes('parse') || error.message.includes('JSON') || error.message.includes('HTML')) return 'PARSE_ERROR';
  }
  return 'UNKNOWN';
}
