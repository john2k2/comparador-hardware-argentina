export class TimeoutAbortError extends Error {
  constructor(source: string, timeoutMs: number) {
    super(`[${source}] timeout after ${timeoutMs}ms`);
    this.name = 'TimeoutAbortError';
  }
}

export async function withAbortTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  source: string,
): Promise<T> {
  const controller = new AbortController();
  const timeoutError = new TimeoutAbortError(source, timeoutMs);
  const timeoutHandle = setTimeout(() => {
    controller.abort(timeoutError);
  }, timeoutMs);

  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (reason instanceof Error) {
        throw reason;
      }
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number, source: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new TimeoutAbortError(source, timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      },
    );
  });
}
