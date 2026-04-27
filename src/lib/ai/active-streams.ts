// src/lib/ai/active-streams.ts
// ─── Active Streams Store ─────────────────────────────────
// In-memory registry of project IDs (and chat IDs) that currently have a
// streaming chat session in flight. The chat stream route registers itself
// when it starts and unregisters in `finally`, so the sidebar can show a
// real "work in progress" indicator instead of relying on a stale
// `chats.updatedAt` window.
//
// The per-chat map additionally lets the chat panel decide whether to
// open a /stream/subscribe SSE on mount (if active) or just render the
// persisted `messages` array (if not).
//
// markStreamStart / markStreamEnd ALSO create / end the per-chat
// event journal so late subscribers can replay the in-flight turn from
// SQLite.

import { startJournal, endJournal } from './event-journal';

const activeProjectStreams = new Map<string, number>();
const activeChatStreams = new Map<string, number>();

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function drop(map: Map<string, number>, key: string): void {
  const count = map.get(key) ?? 0;
  if (count <= 1) {
    map.delete(key);
  } else {
    map.set(key, count - 1);
  }
}

/**
 * Mark that a streaming chat has started for the given project + chat.
 * Returns `true` if this is a fresh start (caller may proceed) or `false`
 * if a journal is already active for this chat (caller MUST refuse the
 * new POST with HTTP 409 — there is already a live stream).
 */
export async function markStreamStart(
  projectId: string,
  chatId?: string,
): Promise<boolean> {
  if (chatId) {
    const ok = await startJournal(chatId);
    if (!ok) return false; // already active
    bump(activeChatStreams, chatId);
  }
  // Order matters: if startJournal rejected the chat above, we already
  // returned without bumping the project count — the caller will 409
  // the request, so no new stream actually started.
  bump(activeProjectStreams, projectId);
  return true;
}

/** Mark that a streaming chat has finished for the given project + chat. */
export async function markStreamEnd(
  projectId: string,
  chatId?: string,
): Promise<void> {
  drop(activeProjectStreams, projectId);
  if (chatId) {
    drop(activeChatStreams, chatId);
    await endJournal(chatId);
  }
}

/** Snapshot of project IDs that currently have at least one active stream. */
export function getActiveProjectIds(): Set<string> {
  return new Set(activeProjectStreams.keys());
}

/** Whether the given project currently has an active stream. */
export function isProjectActive(projectId: string): boolean {
  return activeProjectStreams.has(projectId);
}

/** Whether the given chat currently has an active stream. */
export function isChatActive(chatId: string): boolean {
  return activeChatStreams.has(chatId);
}
