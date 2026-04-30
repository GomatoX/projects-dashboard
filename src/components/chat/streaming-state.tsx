// src/components/chat/streaming-state.tsx
//
// COMPATIBILITY SHIM — preserves the legacy `useStreamingState()` API
// while the consumer (`ChatPanel.tsx`) is decomposed in Phase 2.
// The Provider is a passthrough; state lives in `streaming-store.ts`.
// Delete this file at the end of Phase 4 once nothing imports it.

'use client';

import { type ReactNode } from 'react';
import {
  addPermission,
  addToolActivity,
  appendText,
  appendTurnBreak,
  begin,
  bumpSeq,
  clear,
  end,
  readSlice,
  setSessionId,
  updatePermission,
  type ChatStreamState,
} from './streaming-store';
import type { PermissionRequest, ToolActivity } from './ToolApprovalCard';

export type { ChatStreamState };

interface StreamingStateContextValue {
  get: (chatId: string) => ChatStreamState;
  begin: (chatId: string) => void;
  appendText: (chatId: string, text: string) => void;
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
  end: (chatId: string) => void;
  clear: (chatId: string) => void;
}

// Stable singleton — every dispatcher is a module-level function reference,
// so this object never has to change. (`get` reads through the live store.)
const STABLE_VALUE: StreamingStateContextValue = {
  get: readSlice,
  begin,
  appendText,
  appendTurnBreak,
  setSessionId,
  addToolActivity,
  addPermission,
  updatePermission,
  bumpSeq,
  end,
  clear,
};

export function StreamingStateProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useStreamingState(): StreamingStateContextValue {
  return STABLE_VALUE;
}
