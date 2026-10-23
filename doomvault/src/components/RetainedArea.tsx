import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/** Initialize on first visit, then retain the area's navigation/form state. */
export default function RetainedArea({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  return <div hidden={!active} style={{ display: active ? "block" : "none" }}>{active || visited ? children : null}</div>;
}
