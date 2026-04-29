'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// Distance from the bottom (in px) within which we still consider the user
// "at the bottom". Two thresholds form a deadband (hysteresis) to prevent
// flicker when the user is hovering near the edge: we RELEASE stickiness
// once distance exceeds RELEASE_PX, and only RE-ENGAGE when distance drops
// below REENGAGE_PX. With a single threshold, sub-pixel scrollTop values
// and Mantine's overlay scrollbar bounce across the boundary on consecutive
// scroll events and the pill flickers. The auto-scroll effect uses
// RELEASE_PX as the "was the user following?" cutoff for streaming snap.
const RELEASE_PX = 50;
const REENGAGE_PX = 8;

interface StickToBottomState {
  /**
   * True when stick-to-bottom is currently engaged. Flips to false the
   * instant the user wheels/drags up or scrolls past RELEASE_PX from the
   * end; flips back to true only when they scroll within REENGAGE_PX of
   * the end (or the chat is reset).
   */
  isAtBottom: boolean;
  /**
   * Programmatically scroll to the live edge. Defaults to `smooth` for the
   * pill-click case; the hook itself uses `auto` (instant) internally so
   * streaming token deltas don't fight a re-firing smooth animation.
   */
  jumpToBottom: (behavior?: ScrollBehavior) => void;
}

/**
 * "Stick to bottom" behavior for a streaming chat viewport.
 *
 * Three signals work together so the pill state stays correct without
 * fighting itself during fast streaming:
 *
 * 1. **Wheel/touch intent (immediate)** — A wheel-up or finger-drag-down
 *    whose *projected* post-event position falls outside the re-engage
 *    deadband flips `isAtBottom` to false synchronously, BEFORE the
 *    browser dispatches the resulting scroll event. This solves the
 *    race where a streamed token arrives between the wheel and the
 *    scroll: the auto-scroll effect reads the freshly-flipped flag and
 *    correctly skips. The "projected" check is critical — releasing on
 *    every tiny wheel-up would be undone the next tick by the scroll
 *    handler's hysteresis (which re-engages inside the deadband),
 *    making the pill never appear.
 *
 * 2. **Scroll listener with hysteresis** — Re-engages stickiness when the
 *    user scrolls within REENGAGE_PX of the bottom, releases when they
 *    scroll past RELEASE_PX. The deadband between the two thresholds
 *    prevents flicker around the boundary (sub-pixel scrollTop +
 *    Mantine's overlay scrollbar otherwise bounce a single threshold).
 *
 * 3. **Auto-scroll effect on content change** — Trusts the flag (which
 *    is reliable thanks to #1) and snaps to the new bottom only when
 *    glued. Never overrides user intent.
 */
export function useStickToBottom(
  viewportRef: RefObject<HTMLElement | null>,
  contentDeps: ReadonlyArray<unknown>,
  resetKey: string | null,
): StickToBottomState {
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Mirror in a ref so non-React code paths (listeners, effects) can read
  // the latest value without re-subscribing.
  const isAtBottomRef = useRef(true);

  const setAtBottom = useCallback((next: boolean) => {
    if (isAtBottomRef.current === next) return;
    isAtBottomRef.current = next;
    setIsAtBottom(next);
  }, []);

  // Listeners — wheel/touch (intent), scroll (re-engagement).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    // User-intent: a wheel up or a finger-drag down is an immediate
    // signal to release stickiness — but ONLY if the gesture will
    // actually take the user out of the re-engage deadband. A 3px
    // wheel-up while glued to the bottom would otherwise release
    // synchronously, then get clobbered back to `true` one tick later
    // by the scroll handler (which sees distance=3, well within the
    // REENGAGE_PX zone). Result: pill never appears for any non-trivial
    // wheel either, because state flips false→true within the same
    // gesture. Project the post-event position and skip the release
    // if it lands inside the deadband.
    //
    // The `overflow <= 0` early-return is critical: in a fresh chat
    // with no scrollable content, projectedDistance reduces to
    // |deltaY| and any non-trivial wheel would falsely release. Since
    // the scroll handler can't fire (nothing scrolls), the flag would
    // get stuck at `false` and the pill would show as soon as the
    // first streamed token arrives — despite the chat having nowhere
    // to scroll.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY >= 0) return;
      const overflow = Math.max(0, el.scrollHeight - el.clientHeight);
      if (overflow <= 0) return;
      const projectedDistance = overflow - el.scrollTop + Math.abs(e.deltaY);
      if (projectedDistance > REENGAGE_PX) setAtBottom(false);
    };

    let lastTouchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      lastTouchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? null;
      if (y == null || lastTouchY == null) return;
      const dy = y - lastTouchY;
      lastTouchY = y;
      // Finger moves down (y grows) → content scrolls up → release —
      // but only if the drag would clear the re-engage deadband, for
      // the same reason as the wheel handler above. Same `overflow <= 0`
      // guard: a swipe on an empty chat must not strand the flag at
      // `false`.
      if (dy <= 0) return;
      const overflow = Math.max(0, el.scrollHeight - el.clientHeight);
      if (overflow <= 0) return;
      const projectedDistance = overflow - el.scrollTop + dy;
      if (projectedDistance > REENGAGE_PX) setAtBottom(false);
    };
    const onTouchEnd = () => {
      lastTouchY = null;
    };

    // Scroll: applies hysteresis. Only flips state when distance crosses
    // the *opposite* threshold from the current state. If currently glued
    // (true), require distance > RELEASE_PX to release. If currently
    // released (false), require distance < REENGAGE_PX to re-engage.
    // Between the two, state is sticky → no flicker.
    const onScroll = () => {
      const overflow = Math.max(0, el.scrollHeight - el.clientHeight);
      if (overflow <= 0) {
        setAtBottom(true);
        return;
      }
      const distance = overflow - el.scrollTop;
      if (isAtBottomRef.current) {
        if (distance > RELEASE_PX) setAtBottom(false);
      } else {
        if (distance < REENGAGE_PX) setAtBottom(true);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('scroll', onScroll);
    };
  }, [viewportRef, setAtBottom, resetKey]);

  // Reset on chat switch — instant jump to bottom, fresh state.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  }, [resetKey, viewportRef]);

  // Auto-scroll on content change.
  //
  // Trust the stickiness flag: wheel/touch listeners flip it to false
  // immediately on user intent (before the browser even dispatches the
  // resulting scroll event), so it's not racy. If they were glued (true),
  // snap to the new bottom. If they actively scrolled away (false), leave
  // them alone — never override their intent here. (Earlier revisions
  // force-restored the flag to true after snapping, which clobbered
  // wheel-up intent that arrived just before a streamed token; that race
  // is what caused the pill to flicker on/off near the bottom.)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    if (isAtBottomRef.current && el.scrollHeight > 0) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    }
    // contentDeps is intentionally spread; the consumer owns "content
    // changed". eslint can't statically verify spread deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, contentDeps);

  const jumpToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const el = viewportRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    [viewportRef],
  );

  return { isAtBottom, jumpToBottom };
}
