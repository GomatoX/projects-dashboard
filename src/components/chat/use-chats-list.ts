'use client';

import { useState, useCallback, useEffect } from 'react';
import { type ChatMsg } from './ChatMessage';
import { MODEL_OPTIONS } from './ChatHeader';
import {
  hasPreview as hasPreviewInStore,
  writePreview as writePreviewToStore,
  clearPreview,
} from './preview-store';
import { clear as clearStreamingState } from './streaming-store';
import { setPoppedOut } from './preview/popout-state-store';
import { clearChat as clearBrowserFrames } from '@/lib/ai/browser-frame-store';
import { EMPTY_PREVIEW_STATE, type PreviewState } from '@/lib/ai/preview-types';
import { extractAllPreviews } from '@/lib/ai/preview-detector';
import { mergePreviewItem } from '@/lib/ai/preview-merge';
import { notify } from '@/lib/notify';

interface Chat {
  id: string;
  projectId: string;
  title: string;
  model: string;
  executionMode: 'local' | 'remote';
  totalTokensIn: number;
  totalTokensOut: number;
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
  isStreaming?: boolean;
}

const LAST_MODEL_STORAGE_KEY = 'chat:lastSelectedModel';
const LAST_MODE_STORAGE_KEY = 'chat:lastExecutionMode';
const CHAT_LIST_POLL_MS = 3000;

// Helpers for working with the per-chat Sets — keeping these as tiny pure
// functions makes the state updates below much easier to read.
function withAdded(set: Set<string>, key: string): Set<string> {
  if (set.has(key)) return set;
  const next = new Set(set);
  next.add(key);
  return next;
}

function withRemoved(set: Set<string>, key: string): Set<string> {
  if (!set.has(key)) return set;
  const next = new Set(set);
  next.delete(key);
  return next;
}

export function useChatsList(projectId: string, defaultModel: string) {
  const [chatList, setChatList] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  // Messages are still shown only for the active chat — switching chats
  // replaces this list. Background streams persist their assistant messages
  // server-side and are picked up on the next switch.
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  // Server-reported in-flight turns (e.g. after a refresh, or another tab
  // started the stream). Populated by the chat list poll + the messages
  // fetch on chat switch.
  const [serverStreamingChats, setServerStreamingChats] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState(defaultModel);

  // Load last selected model from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(LAST_MODEL_STORAGE_KEY);
    if (saved && MODEL_OPTIONS.some((m) => m.value === saved)) {
      setSelectedModel(saved);
    }
  }, []);

  // Fetch chat list. The endpoint annotates each chat with `isStreaming`,
  // which we mirror into `serverStreamingChats` so the panel stays in sync
  // even for chats this browser isn't actively driving.
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`);
      const data: Chat[] = await res.json();
      setChatList(data);
      setServerStreamingChats((prev) => {
        const next = new Set<string>();
        for (const c of data) {
          if (c.isStreaming) next.add(c.id);
        }
        // Avoid pointless re-renders if nothing changed.
        if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
          return prev;
        }
        return next;
      });
      return data;
    } catch {
      return [];
    }
  }, [projectId]);

  // Fetch messages for a chat. Also picks up the server-side `isStreaming`
  // flag so a page refresh mid-turn restores the "Thinking..." indicator.
  const fetchMessages = useCallback(
    async (chatId: string) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/chat/${chatId}/messages`);
        const data = await res.json();
        // Tolerate the legacy array-shaped response in case anything still
        // returns it (older client cache, dev hot-reload, etc.).
        const msgs: ChatMsg[] = Array.isArray(data) ? data : (data.messages ?? []);
        const isStreaming = !Array.isArray(data) && Boolean(data.isStreaming);
        setMessages(msgs);
        setServerStreamingChats((prev) =>
          isStreaming ? withAdded(prev, chatId) : withRemoved(prev, chatId),
        );

        // Restore history previews only when no live state exists yet —
        // a live stream populates the store and overrides this path.
        if (!hasPreviewInStore(chatId)) {
          let restored: PreviewState = EMPTY_PREVIEW_STATE;
          for (const m of msgs) {
            if (m.role !== 'assistant' || !m.content) continue;
            const events = extractAllPreviews(m.content);
            for (const ev of events) {
              restored = mergePreviewItem(restored, ev, Date.now());
            }
          }
          if (restored.items.length > 0) {
            writePreviewToStore(chatId, () => restored);
          }
        }
      } catch {
        setMessages([]);
      }
    },
    [projectId],
  );

  // Load initial data
  useEffect(() => {
    (async () => {
      const existingChats = await fetchChats();
      if (existingChats.length > 0) {
        setActiveChat(existingChats[0].id);
        await fetchMessages(existingChats[0].id);
      }
      setLoading(false);
    })();
  }, [fetchChats, fetchMessages]);

  // Poll the chat list so cross-chat activity (other tabs, background turns,
  // a sibling chat that just finished) is reflected without manual refresh.
  // Cheap query — single SELECT plus an in-memory Map lookup per row.
  useEffect(() => {
    const interval = setInterval(() => {
      fetchChats();
    }, CHAT_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchChats]);

  // Create new chat
  const createChat = async () => {
    try {
      const lastMode =
        typeof window !== 'undefined'
          ? ((window.localStorage.getItem(LAST_MODE_STORAGE_KEY) as 'local' | 'remote') ?? 'local')
          : 'local';
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, executionMode: lastMode }),
      });
      const chat = await res.json();
      setChatList((prev) => [chat, ...prev]);
      setActiveChat(chat.id);
      setMessages([]);
    } catch {
      notify({ title: 'Error', message: 'Failed to create chat', color: 'red' });
    }
  };

  // Switch chat
  const switchChat = async (chatId: string) => {
    setActiveChat(chatId);
    // Clear messages eagerly so MessageList's empty-state guard unmounts
    // Virtuoso. When `fetchMessages` resolves, Virtuoso remounts with the
    // correct `initialTopMostItemIndex` and lands at the bottom. Without this,
    // Virtuoso would remount with the previous chat's stale messages and
    // freeze the initial scroll position to that stale length.
    setMessages([]);
    const chat = chatList.find((c) => c.id === chatId);
    if (chat?.model) {
      setSelectedModel(chat.model);
    }
    await fetchMessages(chatId);
  };

  // Delete chat
  const deleteChat = async (chatId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/chat/${chatId}`, {
        method: 'DELETE',
      });
      // Drop per-chat client-side state so deleted chats don't linger in memory.
      // Browser frames would otherwise persist until the agent emits
      // BROWSER_CONTEXT_CLOSED (idle TTL); streaming/preview slices would persist
      // until process restart. Bounded but worth cleaning up at the obvious moment.
      clearBrowserFrames(chatId);
      clearStreamingState(chatId);
      clearPreview(chatId);
      setPoppedOut(chatId, false);
      const updated = chatList.filter((c) => c.id !== chatId);
      setChatList(updated);
      if (activeChat === chatId) {
        if (updated.length > 0) {
          setActiveChat(updated[0].id);
          // Same rationale as `switchChat`: clear before fetching so Virtuoso
          // remounts at the bottom of the new chat instead of inheriting the
          // deleted chat's scroll/length.
          setMessages([]);
          await fetchMessages(updated[0].id);
        } else {
          setActiveChat(null);
          setMessages([]);
        }
      }
    } catch {
      notify({ title: 'Error', message: 'Failed to delete chat', color: 'red' });
    }
  };

  return {
    chatList,
    activeChat,
    messages,
    loading,
    serverStreamingChats,
    selectedModel,
    setSelectedModel,
    setChatList, // for header onModelChange/onModeChange to update local rows
    setMessages, // for sendMessage's optimistic user-message append
    createChat,
    switchChat,
    deleteChat,
    fetchMessages, // exposed because the SSE reader needs it on `done`
    fetchChats, // same
  };
}
