import { useEffect } from "react";

// Reloads the page on an interval while a mission is still running, so the
// Founder can watch assignments complete.
export function AutoRefresh({
  active,
  intervalMs = 5000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => window.location.reload(), intervalMs);
    return () => window.clearTimeout(timer);
  }, [active, intervalMs]);

  return null;
}
