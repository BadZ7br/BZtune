/** Bounds the whole operation (headers, JSON body or IPC), even if it ignores abort. */
export const REQUEST_TIMEOUT_MS = 30_000;
export class RequestDeadlineError extends Error {
  constructor(public readonly timedOut: boolean) {
    super(timedOut ? "A consulta demorou demais. Tente novamente." : "Operação cancelada.");
    this.name = timedOut ? "RequestDeadlineError" : "AbortError";
  }
}
export async function withRequestDeadline<T>(work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      const stop = (timedOut: boolean) => {
        reject(new RequestDeadlineError(timedOut));
        controller.abort();
      };
      cancel = () => stop(false);
      if (signal?.aborted) { stop(false); return; }
      signal?.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => stop(true), REQUEST_TIMEOUT_MS);
      // Both handlers stay attached after a timeout: a late rejection cannot be unhandled.
      try { work(controller.signal).then(resolve, reject); } catch (error) { reject(error); }
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (cancel) signal?.removeEventListener("abort", cancel);
  }
}
