'use client';

import { useEffect, useRef } from 'react';

const BASE_TITLE = 'Dev Dashboard';
const POLL_INTERVAL_MS = 5_000;

/**
 * Side-effect component: keeps the browser tab `<title>` in sync with the
 * number of in-flight chat streams across the whole dashboard. Renders nothing.
 *
 * Format:
 *   - 0 active → `Dev Dashboard`
 *   - N active → `● (N) Dev Dashboard`
 *
 * The leading dot makes the active state legible even when the tab is narrow
 * and the count is clipped. We re-apply the title every poll so navigations
 * (which restore the static metadata title) don't strand a stale value.
 */
export function ActiveTitleUpdater() {
  const lastCountRef = useRef<number>(-1);

  useEffect(() => {
    let cancelled = false;

    const apply = (count: number) => {
      lastCountRef.current = count;
      document.title = count > 0 ? `● (${count}) ${BASE_TITLE}` : BASE_TITLE;
    };

    const tick = async () => {
      try {
        const res = await fetch('/api/active-streams', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { count?: number };
        if (cancelled) return;
        apply(typeof data.count === 'number' ? data.count : 0);
      } catch {
        // Network blip — keep the previous title until the next tick.
      }
    };

    tick();
    const timer = setInterval(tick, POLL_INTERVAL_MS);

    // Refresh as soon as the tab becomes visible again — covers the case
    // where a stream finished while the tab was backgrounded and the user
    // would otherwise see a stale "● (1) …" until the next poll.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      document.title = BASE_TITLE;
    };
  }, []);

  return null;
}
