import { recordRequestFailure } from "./diagnostic-events";
/** Local service requests always have a deadline, including response bodies. */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  return fetch(input, { ...init, signal }).then(response=>{
    if(response.status>=400)recordRequestFailure(response.status);
    return response;
  }, error=>{
    if(!init.signal?.aborted)recordRequestFailure('network');
    throw error;
  });
}
