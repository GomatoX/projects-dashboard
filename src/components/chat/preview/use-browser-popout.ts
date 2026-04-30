// src/components/chat/preview/use-browser-popout.ts
//
// Main-window orchestrator for the browser-preview pop-out.
//
// Responsibilities:
//   1. Maintain a per-chatId BroadcastChannel used for both lifecycle
//      messages (popout-ready / popout-closing) and frame bridging.
//   2. While popped out, subscribe to the in-process browser-frame-store
//      and broadcast every new frame onto the channel — that's how the
//      popped window stays in sync.
//   3. Expose openPopout(): opens (or re-focuses) the popout window.
//
// Notes:
//   - We do NOT bridge frames unconditionally; we only attach the frame-store
//     subscriber when isPoppedOut is true. This avoids unnecessary postMessage
//     traffic for every chat in the dashboard.
//   - The popped window has its OWN browser-frame-store (separate JS context),
//     so on popout-ready we explicitly bridge the current latest frame so the
//     window doesn't sit on "Waiting…" until the next live frame arrives.

'use client';

import { useEffect, useRef } from 'react';
import {
  getLatestFrame,
  subscribe as subscribeFrames,
} from '@/lib/ai/browser-frame-store';
import {
  openPopoutChannel,
  popoutWindowName,
  type PopoutMessage,
} from '@/lib/browser-popout-channel';
import { setPoppedOut, usePoppedOut } from './popout-state-store';

interface UseBrowserPopoutResult {
  isPoppedOut: boolean;
  /** Open or re-focus the popout window for this chat. */
  openPopout: () => void;
}

// Reasonable default size; users can resize. We aim for something larger than
// the typical 800-wide JPEG the agent emits so frames don't upscale.
const POPOUT_FEATURES = 'width=1280,height=820,resizable=yes,scrollbars=no';

export function useBrowserPopout(chatId: string | null): UseBrowserPopoutResult {
  const isPoppedOut = usePoppedOut(chatId ?? '');
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Lifecycle: open the channel for the active chat, listen for ready/close.
  useEffect(() => {
    if (!chatId) return;
    const channel = openPopoutChannel(chatId);
    if (!channel) return;
    channelRef.current = channel;

    const onMessage = (e: MessageEvent<PopoutMessage>) => {
      const msg = e.data;
      if (msg.type === 'popout-ready' && msg.chatId === chatId) {
        setPoppedOut(chatId, true);
        // Send the most-recent frame so the popped window doesn't sit on
        // "Waiting…" if no fresh frame arrives soon.
        const latest = getLatestFrame(chatId);
        if (latest) {
          channel.postMessage({ type: 'frame', frame: latest } satisfies PopoutMessage);
        }
      } else if (msg.type === 'popout-closing' && msg.chatId === chatId) {
        setPoppedOut(chatId, false);
      }
    };
    channel.addEventListener('message', onMessage);

    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
      channelRef.current = null;
      // Do not clear isPoppedOut here. The popped window may still be open
      // while the user browses other chats; on return, the store's stale-true
      // value correctly shows the placeholder.
      //
      // v1 known limitations after switching chats and back:
      //   - The popped window only sends popout-ready on its initial mount,
      //     so the new channel we open above will NOT receive any further
      //     frames from it — the bridge is silently broken for that chat
      //     until the popped window is closed and re-opened.
      //   - If the popped window was closed while the user was on another
      //     chat, the placeholder will stick until the user manually clicks
      //     ⧉ again or the chat is reloaded.
      // Acceptable for v1; both fix together with a popout-ping handshake.
    };
  }, [chatId]);

  // Frame bridge: only while popped out.
  useEffect(() => {
    if (!chatId || !isPoppedOut) return;
    // channelRef is populated by the lifecycle effect above; both effects run
    // for the same chatId in declaration order, so by the time isPoppedOut
    // can flip true, channelRef.current is set. The null guard covers the
    // BroadcastChannel-unavailable case (effect 1 returns early without
    // assigning the ref).
    const channel = channelRef.current;
    if (!channel) return;
    return subscribeFrames(chatId, (frame) => {
      try {
        channel.postMessage({ type: 'frame', frame } satisfies PopoutMessage);
      } catch {
        // Channel closed mid-flight — popout probably went away. The
        // popout-closing handler will reconcile state.
      }
    });
  }, [chatId, isPoppedOut]);

  const openPopout = () => {
    if (!chatId) return;
    const url = `/popout/browser?chatId=${encodeURIComponent(chatId)}`;
    // Reusing the same window name re-focuses an existing popout instead of
    // spawning a duplicate.
    const w = window.open(url, popoutWindowName(chatId), POPOUT_FEATURES);
    if (w) {
      try {
        w.focus();
      } catch {
        // Some browsers block focus() across tabs; harmless.
      }
    }
  };

  return { isPoppedOut: chatId ? isPoppedOut : false, openPopout };
}
