// src/components/chat/preview/popout-state-store.ts
//
// Per-chatId pub-sub for "is the browser preview currently popped out into a
// separate window?". Used by PreviewPanel to swap the live <BrowserPreview>
// for a placeholder, and by ChatPanel for any UI that depends on it.
//
// Mirrors the public-API shape of browser-frame-store.ts so both feel
// consistent. Internally we use a single global listener Set rather than
// per-chatId fan-out — this is fine for a boolean flag with a handful of
// subscribers; revisit if many open chats simultaneously call usePoppedOut.

'use client';

import { useSyncExternalStore } from 'react';

const popped = new Set<string>();
const listeners = new Set<() => void>();

export function setPoppedOut(chatId: string, value: boolean): void {
  const had = popped.has(chatId);
  if (value && !had) popped.add(chatId);
  else if (!value && had) popped.delete(chatId);
  else return; // no-op, don't notify
  for (const l of listeners) l();
}

export function getPoppedOut(chatId: string): boolean {
  return popped.has(chatId);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePoppedOut(chatId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => popped.has(chatId),
    () => false, // server snapshot — popout is client-only
  );
}
