// src/components/chat/streaming-state.tsx
//
// Dashboard-scoped React context holding live streaming state per chatId.
// Lives ABOVE the project page so it survives navigation between projects
// without losing in-flight turn state. Hard reloads still wipe this
// context — the server-side journal handles that case via the subscribe
// endpoint.
//
// State shape per chat:
//   - content: accumulated assistant text streamed so far
//   - toolActivities: ordered list of tool activity badges
//   - permissions: pending / responded permission requests
//   - sessionId: remote-mode SDK session id (for cancel/permission RPC)
//   - lastEventSeq: highest journal seq this client has consumed (for
//                   resubscribe deduplication)
//   - active: true while a stream is producing events for this chat
//
// All updates go through dispatch helpers exposed by the context — the
// helpers preserve immutability so consumer components re-render correctly.

'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type {
  PermissionRequest,
  ToolActivity,
} from './ToolApprovalCard';
import { type PreviewState } from '@/lib/ai/preview-types';

export interface ChatStreamState {
  content: string;
  toolActivities: ToolActivity[];
  permissions: PermissionRequest[];
  sessionId: string | null;
  lastEventSeq: number;
  active: boolean;
  preview: PreviewState | null;
}

// Frozen at the top level so consumers cannot accidentally reassign a
// field on the shared default (e.g. `state.content = ''`). The arrays
// are not deep-frozen because TypeScript's `readonly never[]` does not
// satisfy `ToolActivity[]` without an `unknown` cast — and every mutator
// goes through `update`, which spreads into a new object, so the arrays
// are never mutated in practice.
const EMPTY_STATE: ChatStreamState = Object.freeze({
  content: '',
  toolActivities: [],
  permissions: [],
  sessionId: null,
  lastEventSeq: 0,
  active: false,
  preview: null,
});

interface StreamingStateContextValue {
  /**
   * Returns the current state (or EMPTY_STATE) for a chat.
   *
   * Note: this callback is recreated on every state change (`useCallback`
   * deps include `byChat`), so it is NOT stable as a `useEffect` dep.
   * Read it during render and pass the resulting slice instead, e.g.:
   *   const slice = streaming.get(chatId);
   *   useEffect(..., [slice.content, slice.permissions.length]);
   */
  get: (chatId: string) => ChatStreamState;
  /** Begin a fresh turn — clears prior content/tools/perms and marks active. */
  begin: (chatId: string) => void;
  appendText: (chatId: string, text: string) => void;
  /**
   * Insert a paragraph-break separator between two assistant turns within
   * the same chat-level streaming bubble. Idempotent at the boundary —
   * calling it twice in a row, or right after content that already ends
   * with `\n\n`, won't stack additional blank lines (which the markdown
   * renderer would otherwise turn into ever-larger gaps).
   */
  appendTurnBreak: (chatId: string) => void;
  setSessionId: (chatId: string, sessionId: string) => void;
  addToolActivity: (chatId: string, activity: ToolActivity) => void;
  addPermission: (chatId: string, perm: PermissionRequest) => void;
  updatePermission: (
    chatId: string,
    toolUseId: string,
    status: PermissionRequest['status'],
  ) => void;
  bumpSeq: (chatId: string, seq: number) => void;
  setPreview: (chatId: string, preview: PreviewState) => void;
  /** Stream finished — leave content visible briefly for the consumer to fold into history, then call clear. */
  end: (chatId: string) => void;
  /** Drop all streaming state for a chat (e.g. after assistant message persisted). */
  clear: (chatId: string) => void;
}

const StreamingStateContext = createContext<StreamingStateContextValue | null>(
  null,
);

export function StreamingStateProvider({ children }: { children: ReactNode }) {
  const [byChat, setByChat] = useState<Record<string, ChatStreamState>>({});

  const update = useCallback(
    (chatId: string, mut: (prev: ChatStreamState) => ChatStreamState) => {
      setByChat((prev) => {
        const current = prev[chatId] ?? EMPTY_STATE;
        const next = mut(current);
        if (next === current) return prev;
        return { ...prev, [chatId]: next };
      });
    },
    [],
  );

  const get = useCallback(
    (chatId: string) => byChat[chatId] ?? EMPTY_STATE,
    [byChat],
  );

  const begin = useCallback(
    (chatId: string) => {
      update(chatId, () => ({
        content: '',
        toolActivities: [],
        permissions: [],
        sessionId: null,
        lastEventSeq: 0,
        active: true,
        preview: null,
      }));
    },
    [update],
  );

  const appendText = useCallback(
    (chatId: string, text: string) => {
      update(chatId, (s) => ({ ...s, content: s.content + text }));
    },
    [update],
  );

  const appendTurnBreak = useCallback(
    (chatId: string) => {
      update(chatId, (s) => {
        // Don't add a separator before any content has streamed — there's
        // nothing to separate from yet (would render as a leading empty
        // paragraph). Also skip when the buffer already ends with one,
        // which prevents stacked breaks if the server emits redundant
        // turn_break markers (e.g. trailing one at the very end of the
        // turn that gets consumed by both the local and remote paths).
        if (s.content.length === 0) return s;
        if (s.content.endsWith('\n\n')) return s;
        return { ...s, content: s.content + '\n\n' };
      });
    },
    [update],
  );

  const setSessionId = useCallback(
    (chatId: string, sessionId: string) => {
      update(chatId, (s) => ({ ...s, sessionId }));
    },
    [update],
  );

  const addToolActivity = useCallback(
    (chatId: string, activity: ToolActivity) => {
      update(chatId, (s) => ({
        ...s,
        toolActivities: [...s.toolActivities, activity],
      }));
    },
    [update],
  );

  const addPermission = useCallback(
    (chatId: string, perm: PermissionRequest) => {
      update(chatId, (s) => ({ ...s, permissions: [...s.permissions, perm] }));
    },
    [update],
  );

  const updatePermission = useCallback(
    (chatId: string, toolUseId: string, status: PermissionRequest['status']) => {
      update(chatId, (s) => ({
        ...s,
        permissions: s.permissions.map((p) =>
          p.toolUseId === toolUseId ? { ...p, status } : p,
        ),
      }));
    },
    [update],
  );

  const bumpSeq = useCallback(
    (chatId: string, seq: number) => {
      update(chatId, (s) => (seq > s.lastEventSeq ? { ...s, lastEventSeq: seq } : s));
    },
    [update],
  );

  const setPreview = useCallback(
    (chatId: string, preview: PreviewState) => {
      update(chatId, (s) => ({ ...s, preview }));
    },
    [update],
  );

  const end = useCallback(
    (chatId: string) => {
      // No-op when the slice has already been cleared. Without this guard,
      // `update`'s `prev[chatId] ?? EMPTY_STATE` fallback would re-create a
      // residual `{...EMPTY_STATE, active: false}` slice every time the
      // stream finally-block ran after a successful `clear` in the done
      // handler, leaking one map entry per turn.
      setByChat((prev) => {
        const cur = prev[chatId];
        if (!cur) return prev;
        if (cur.active === false) return prev;
        return { ...prev, [chatId]: { ...cur, active: false } };
      });
    },
    [],
  );

  const clear = useCallback(
    (chatId: string) => {
      setByChat((prev) => {
        if (!(chatId in prev)) return prev;
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
    },
    [],
  );

  const value = useMemo<StreamingStateContextValue>(
    () => ({
      get,
      begin,
      appendText,
      appendTurnBreak,
      setSessionId,
      addToolActivity,
      addPermission,
      updatePermission,
      bumpSeq,
      setPreview,
      end,
      clear,
    }),
    [
      get,
      begin,
      appendText,
      appendTurnBreak,
      setSessionId,
      addToolActivity,
      addPermission,
      updatePermission,
      bumpSeq,
      setPreview,
      end,
      clear,
    ],
  );

  return (
    <StreamingStateContext.Provider value={value}>
      {children}
    </StreamingStateContext.Provider>
  );
}

export function useStreamingState(): StreamingStateContextValue {
  const ctx = useContext(StreamingStateContext);
  if (!ctx) {
    throw new Error(
      'useStreamingState must be used within <StreamingStateProvider>',
    );
  }
  return ctx;
}
