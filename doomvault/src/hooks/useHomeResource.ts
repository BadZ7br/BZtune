import { useEffect, useState } from "react";

type Resource<T> = { status: "loading" | "success" | "error"; items: T[] };

/** Each section loads independently; late responses cannot overwrite a new request. */
export function useHomeResource<T>(load: (signal: AbortSignal) => Promise<T[]>) {
  const [resource, setResource] = useState<Resource<T>>({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setResource({ status: "loading", items: [] });
    // IPC cannot be cancelled, so also settle the UI if the native read hangs.
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false;
      controller.abort();
      setResource({ status: "error", items: [] });
    }, 15_000);
    void load(controller.signal).then(items => {
      if (active) setResource({ status: "success", items });
    }).catch(() => {
      if (active) setResource({ status: "error", items: [] });
    }).finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [load, attempt]);
  return { ...resource, retry: () => setAttempt(value => value + 1) };
}
