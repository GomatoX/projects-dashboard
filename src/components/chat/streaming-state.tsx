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

export interface ChatStreamState {
  content: string;
  toolActivities: ToolActivity[];
  permissions: PermissionRequest[];
  sessionId: string | null;
  lastEventSeq: number;
  active: boolean;
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
  setSessionId: (chatId: string, sessionId: string) => void;
  addToolActivity: (chatId: string, activity: ToolActivity) => void;
  addPermission: (chatId: string, perm: PermissionRequest) => void;
  updatePermission: (
    chatId: string,
    toolUseId: string,
    status: PermissionRequest['status'],
  ) => void;
  bumpSeq: (chatId: string, seq: number) => void;
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

  const end = useCallback(
    (chatId: string) => {
      update(chatId, (s) => ({ ...s, active: false }));
    },
    [update],
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
      setSessionId,
      addToolActivity,
      addPermission,
      updatePermission,
      bumpSeq,
      end,
      clear,
    }),
    [
      get,
      begin,
      appendText,
      setSessionId,
      addToolActivity,
      addPermission,
      updatePermission,
      bumpSeq,
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
