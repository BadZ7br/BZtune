import { recordRequestFailure } from "./diagnostic-events";
/** Local service requests always have a deadline, including response bodies. */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  return observedFetch(input, { ...init, signal }, init.signal ?? null);
}

/** Observe transport failures without adding a second deadline to bounded operations. */
export function observedFetch(input: RequestInfo | URL, init: RequestInit = {}, callerSignal: AbortSignal | null | undefined = init.signal): Promise<Response> {
  return fetch(input, init).then(response => {
    if (response.status >= 400) recordRequestFailure(response.status);
    return response;
  }, error => {
    if (!callerSignal?.aborted) recordRequestFailure('network');
    throw error;
  });
}
