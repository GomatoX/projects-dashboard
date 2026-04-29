// src/lib/ai/browser-frame-store.ts
//
// Tiny in-memory pub-sub for browser screencast frames. Keyed by chatId.
// Multiple subscribers per chat are allowed (PreviewPanel + a future
// detached window, if we ever add one).

export interface BrowserFrame {
  frameB64: string;
  width: number;
  height: number;
  url: string;
  timestamp: number;
}

type Listener = (frame: BrowserFrame) => void;
const latest = new Map<string, BrowserFrame>();
const listeners = new Map<string, Set<Listener>>();

export function pushFrame(chatId: string, frame: BrowserFrame): void {
  latest.set(chatId, frame);
  const ls = listeners.get(chatId);
  if (ls) for (const l of ls) l(frame);
}

export function getLatestFrame(chatId: string): BrowserFrame | undefined {
  return latest.get(chatId);
}

export function subscribe(chatId: string, fn: Listener): () => void {
  let set = listeners.get(chatId);
  if (!set) {
    set = new Set();
    listeners.set(chatId, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
    if (set && set.size === 0) listeners.delete(chatId);
  };
}

export function clearChat(chatId: string): void {
  latest.delete(chatId);
  listeners.delete(chatId);
}
