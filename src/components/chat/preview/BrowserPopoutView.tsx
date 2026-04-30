// src/components/chat/preview/BrowserPopoutView.tsx
//
// Client component rendered inside the popped-out browser window. Subscribes
// to the per-chatId BroadcastChannel, pushes received frames into the local
// (window-scoped) browser-frame-store, and renders the standard
// <BrowserPreview> for visual parity with the in-page tab.
//
// Lifecycle messages it sends to the main window:
//   - on mount:           popout-ready  (main flips placeholder ON)
//   - on beforeunload:    popout-closing (main flips placeholder OFF)
//
// Dev note: in React StrictMode (Next.js dev default) the effect mounts,
// cleans up, and re-mounts. The main window briefly sees ready→closing→ready,
// causing a millisecond placeholder flicker. Production sees a single mount;
// the final state is correct in both modes — no fix needed.

'use client';

import { useEffect } from 'react';
import { Box, Group, Text } from '@mantine/core';
import {
  openPopoutChannel,
  type PopoutMessage,
} from '@/lib/browser-popout-channel';
import { pushFrame } from '@/lib/ai/browser-frame-store';
import { BrowserPreview } from './BrowserPreview';

interface Props {
  chatId: string;
}

export function BrowserPopoutView({ chatId }: Props) {
  useEffect(() => {
    const channel = openPopoutChannel(chatId);
    if (!channel) return;

    const onMessage = (e: MessageEvent<PopoutMessage>) => {
      const msg = e.data;
      if (msg.type === 'frame') {
        pushFrame(chatId, msg.frame);
      }
      // popout-ready / popout-closing are emitted BY us, not consumed.
    };
    channel.addEventListener('message', onMessage);

    // Tell the main window we're alive so it can start broadcasting frames
    // and show its placeholder.
    channel.postMessage({ type: 'popout-ready', chatId } satisfies PopoutMessage);

    const onBeforeUnload = () => {
      channel.postMessage(
        { type: 'popout-closing', chatId } satisfies PopoutMessage,
      );
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      channel.removeEventListener('message', onMessage);
      // Best-effort: if the cleanup runs without beforeunload firing
      // (e.g. devtools navigation in dev), still flip the main back.
      try {
        channel.postMessage(
          { type: 'popout-closing', chatId } satisfies PopoutMessage,
        );
      } catch {
        // Channel may already be closed in some browsers — ignore.
      }
      channel.close();
    };
  }, [chatId]);

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Group
        px="sm"
        py={6}
        gap={8}
        style={{
          borderBottom: '1px solid var(--mantine-color-dark-5)',
          background: 'var(--mantine-color-dark-8)',
          flexShrink: 0,
        }}
      >
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.5 }}>
          Browser
        </Text>
        <Text size="xs" c="dimmed">
          · close this window to bring the preview back into the dashboard
        </Text>
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <BrowserPreview chatId={chatId} />
      </Box>
    </Box>
  );
}
