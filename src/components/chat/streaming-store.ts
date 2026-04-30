// src/components/chat/streaming-store.ts
//
// Per-chat live streaming state, kept in a module-level Map and surfaced
// to React via `useSyncExternalStore`. Replaces the React-Context store in
// `streaming-state.tsx`.
//
// Why module-level instead of a Provider: every consumer subscribes to a
// SINGLE chat's slice. With a Provider, every dispatch broadcasts a new
// context value to every consumer — including the chat list, the header,
// every prior `<ChatMessage>` — which forces all of them to re-render on
// every streamed token. With per-chat subscriptions, only the components
// rendering the actively streaming chat's slice wake up.
//
// Slice identity: every mutator returns a NEW slice object (immutable),
// so `useSyncExternalStore`'s default `Object.is` comparator correctly
// re-renders subscribers. Mutators short-circuit when no field changes
// (e.g. `appendTurnBreak` against an already-broken buffer) so a redundant
// event does not produce a wasteful render.

'use client';

import { useSyncExternalStore } from 'react';
import type { PermissionRequest, ToolActivity } from './ToolApprovalCard';

export interface ChatStreamState {
  content: string;
  toolActivities: ToolActivity[];
  permissions: PermissionRequest[];
  sessionId: string | null;
  lastEventSeq: number;
  active: boolean;
}

export const EMPTY_STATE: ChatStreamState = Object.freeze({
  content: '',
  toolActivities: [],
  permissions: [],
  sessionId: null,
  lastEventSeq: 0,
  active: false,
});

type Listener = () => void;

// One Set of listeners per chatId — a token delta on chat A only wakes
// subscribers of chat A. The store-wide listener Set ('*') exists so the
// chat list can re-render when *any* chat flips active/inactive.
const slices = new Map<string, ChatStreamState>();
const listeners = new Map<string, Set<Listener>>();
const globalListeners = new Set<Listener>();

function emit(chatId: string): void {
  const ls = listeners.get(chatId);
  if (ls) for (const l of ls) l();
  for (const l of globalListeners) l();
}

function subscribe(chatId: string, fn: Listener): () => void {
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

function getSlice(chatId: string): ChatStreamState {
  return slices.get(chatId) ?? EMPTY_STATE;
}

function update(chatId: string, mut: (prev: ChatStreamState) => ChatStreamState): void {
  const prev = slices.get(chatId) ?? EMPTY_STATE;
  const next = mut(prev);
  if (next === prev) return;
  slices.set(chatId, next);
  emit(chatId);
}

// ─── Public dispatch API (matches the old context API 1:1) ──────────────

export function begin(chatId: string): void {
  update(chatId, () => ({
    content: '',
    toolActivities: [],
    permissions: [],
    sessionId: null,
    lastEventSeq: 0,
    active: true,
  }));
}

export function appendText(chatId: string, text: string): void {
  if (!text) return;
  update(chatId, (s) => ({ ...s, content: s.content + text }));
}

export function appendTurnBreak(chatId: string): void {
  update(chatId, (s) => {
    if (s.content.length === 0) return s;
    if (s.content.endsWith('\n\n')) return s;
    return { ...s, content: s.content + '\n\n' };
  });
}

export function setSessionId(chatId: string, sessionId: string): void {
  update(chatId, (s) => (s.sessionId === sessionId ? s : { ...s, sessionId }));
}

export function addToolActivity(chatId: string, activity: ToolActivity): void {
  update(chatId, (s) => ({
    ...s,
    toolActivities: [...s.toolActivities, activity],
  }));
}

export function addPermission(chatId: string, perm: PermissionRequest): void {
  update(chatId, (s) => ({ ...s, permissions: [...s.permissions, perm] }));
}

export function updatePermission(
  chatId: string,
  toolUseId: string,
  status: PermissionRequest['status'],
): void {
  update(chatId, (s) => ({
    ...s,
    permissions: s.permissions.map((p) => (p.toolUseId === toolUseId ? { ...p, status } : p)),
  }));
}

export function bumpSeq(chatId: string, seq: number): void {
  update(chatId, (s) => (seq > s.lastEventSeq ? { ...s, lastEventSeq: seq } : s));
}

export function end(chatId: string): void {
  update(chatId, (s) => (s.active ? { ...s, active: false } : s));
}

export function clear(chatId: string): void {
  if (!slices.has(chatId)) return;
  slices.delete(chatId);
  emit(chatId);
}

// Direct read for non-React callers (e.g. inside the SSE reader closure
// where reading store-driven sessionId is needed without subscription).
export function readSlice(chatId: string): ChatStreamState {
  return getSlice(chatId);
}

// ─── React subscription hook ────────────────────────────────────────────

export function useChatStreamSlice(chatId: string | null): ChatStreamState {
  return useSyncExternalStore(
    (fn) => {
      if (!chatId) {
        // Subscribe to global so we re-render if a chat is selected later.
        globalListeners.add(fn);
        return () => globalListeners.delete(fn);
      }
      return subscribe(chatId, fn);
    },
    () => (chatId ? getSlice(chatId) : EMPTY_STATE),
    () => EMPTY_STATE, // SSR snapshot
  );
}

// Hook for components that need to know which chats are currently active
// (e.g. the chat list dot indicator). Subscribes to the global listener set.
export function useActiveStreamingChats(): ReadonlySet<string> {
  const subscribe = (fn: Listener): (() => void) => {
    globalListeners.add(fn);
    return () => globalListeners.delete(fn);
  };
  const getSnapshot = (): ReadonlySet<string> => {
    // Return a new Set on demand; the consumer should only re-render if
    // membership actually changed, which it does via the listener fire.
    const out = new Set<string>();
    for (const [id, s] of slices) if (s.active) out.add(id);
    return out;
  };
  // useSyncExternalStore needs a stable snapshot for unchanged calls; cache
  // by membership signature.
  return useSyncExternalStore(
    subscribe,
    () => {
      const sig: string[] = [];
      for (const [id, s] of slices) if (s.active) sig.push(id);
      sig.sort();
      const key = sig.join(',');
      if (key === lastActiveKey) return lastActiveSet;
      lastActiveKey = key;
      lastActiveSet = new Set(sig);
      return lastActiveSet;
    },
    () => EMPTY_ACTIVE_SET,
  );
}

let lastActiveKey = '';
let lastActiveSet: ReadonlySet<string> = new Set();
const EMPTY_ACTIVE_SET: ReadonlySet<string> = new Set();
