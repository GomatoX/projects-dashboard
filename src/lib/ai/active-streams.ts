// ─── Active Streams Store ─────────────────────────────────
// In-memory registry of project IDs (and chat IDs) that currently have a
// streaming chat session in flight. The chat stream route registers itself
// when it starts and unregisters in `finally`, so the sidebar can show a
// real "work in progress" indicator instead of relying on a stale
// `chats.updatedAt` window. The per-chat map additionally lets the chat
// panel itself recover the "Thinking..." state after a page refresh — the
// SSE connection that drove the indicator dies with the page, but the
// agent turn keeps running on the server.
//
// A refcount per project / per chat is used so multiple concurrent
// streams don't clear each other prematurely.

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

/** Mark that a streaming chat has started for the given project + chat. */
export function markStreamStart(projectId: string, chatId?: string): void {
  bump(activeProjectStreams, projectId);
  if (chatId) bump(activeChatStreams, chatId);
}

/** Mark that a streaming chat has finished for the given project + chat. */
export function markStreamEnd(projectId: string, chatId?: string): void {
  drop(activeProjectStreams, projectId);
  if (chatId) drop(activeChatStreams, chatId);
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
