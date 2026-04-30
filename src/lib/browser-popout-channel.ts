// src/lib/browser-popout-channel.ts
//
// Typed BroadcastChannel for bridging browser-preview state from the main
// dashboard window to a popped-out viewer window (and back, for lifecycle).
// One channel per chatId so two popped-out chats don't cross-talk.
//
// Pure module — no React. Both windows import this same file.

import type { BrowserFrame } from '@/lib/ai/browser-frame-store';

/** Channel name for a given chatId. Keep stable — both windows compute it.
 *  Prefer {@link openPopoutChannel} over calling `new BroadcastChannel(channelName(...))`
 *  directly so the SSR-safety guard isn't bypassed. */
export function channelName(chatId: string): string {
  return `browser-popout:${chatId}`;
}

/** window.open() target name. Reusing the same name re-focuses the existing
 *  popout instead of opening a duplicate. Assumes chatId is alphanumeric
 *  (nanoid in this codebase) — re-validate if the chat ID format ever changes. */
export function popoutWindowName(chatId: string): string {
  return `dev-dashboard-browser-popout-${chatId}`;
}

export type PopoutMessage =
  | {
      // No chatId here on purpose: the channel itself is named
      // `browser-popout:<chatId>`, so every message on it is already scoped to
      // one chat. Lifecycle messages (popout-ready/popout-closing) include
      // chatId only as a sanity check that ignores stale buffered messages.
      type: 'frame';
      frame: BrowserFrame;
    }
  | {
      // Popped window → main: "I'm mounted, start sending frames."
      type: 'popout-ready';
      chatId: string;
    }
  | {
      // Popped window → main: "I'm closing (beforeunload), drop placeholder."
      type: 'popout-closing';
      chatId: string;
    };

/** Open a typed channel for this chatId. Caller is responsible for `.close()`
 *  on unmount. Returns `null` in environments without BroadcastChannel
 *  (e.g. tests / very old Safari). */
export function openPopoutChannel(chatId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(channelName(chatId));
}
