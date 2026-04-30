// src/components/chat/preview-store.ts
//
// Per-chat preview-panel state. Mirrors the streaming-store pattern.
// Replaces `lastPreviewsRef` + `setPreviewRevision` in ChatPanel.
//
// Why split from streaming-store: preview events fire MUCH less frequently
// than text deltas (one per fence emission), and the consumer set is
// different (only `<PreviewHost>` cares). Splitting keeps each store's
// listener fan-out focused.

'use client';

import { useSyncExternalStore } from 'react';
import { EMPTY_PREVIEW_STATE, type PreviewState } from '@/lib/ai/preview-types';

type Listener = () => void;

const slices = new Map<string, PreviewState>();
const listeners = new Map<string, Set<Listener>>();

function emit(chatId: string): void {
  const ls = listeners.get(chatId);
  if (ls) for (const l of ls) l();
}

function subscribeFor(chatId: string, fn: Listener): () => void {
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

export function readPreview(chatId: string): PreviewState {
  return slices.get(chatId) ?? EMPTY_PREVIEW_STATE;
}

export function writePreview(
  chatId: string,
  mut: (prev: PreviewState) => PreviewState,
): void {
  const prev = slices.get(chatId) ?? EMPTY_PREVIEW_STATE;
  const next = mut(prev);
  if (next === prev) return;
  slices.set(chatId, next);
  emit(chatId);
}

export function clearPreview(chatId: string): void {
  if (!slices.has(chatId)) return;
  slices.delete(chatId);
  emit(chatId);
}

export function hasPreview(chatId: string): boolean {
  return slices.has(chatId);
}

export function usePreviewSlice(chatId: string | null): PreviewState {
  return useSyncExternalStore(
    (fn) => {
      if (!chatId) return () => {};
      return subscribeFor(chatId, fn);
    },
    () => (chatId ? readPreview(chatId) : EMPTY_PREVIEW_STATE),
    () => EMPTY_PREVIEW_STATE,
  );
}
