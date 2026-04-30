// src/components/chat/MessageList.tsx
//
// Virtualized chat-message list. Rendering 1000 messages stays cheap because
// react-virtuoso only mounts ~30 rows at a time. The streaming bubble lives
// in the Footer slot so it stays "below" the persisted messages without
// being virtualized.
//
// Stick-to-bottom behavior comes from virtuoso's `followOutput` + the
// `atBottomStateChange` callback — replaces the bespoke `useStickToBottom`.

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Box, Button, ActionIcon, Center, Stack, Text } from '@mantine/core';
import { IconSparkles, IconArrowDown, IconPlus } from '@tabler/icons-react';
import { ChatMessage, type ChatMsg } from './ChatMessage';
import { StreamingBubble } from './StreamingBubble';

interface MessageListProps {
  activeChat: string | null;
  messages: ChatMsg[];
  showsLiveTurn: boolean;
  /** True when the SERVER reports the active chat's turn is in flight but this tab isn't driving. */
  serverStreaming: boolean;
  respondingToToolUseId: string | null;
  onApprovePermission: (toolUseId: string) => void;
  onDenyPermission: (toolUseId: string) => void;
  onCreate: () => void;
}

export function MessageList({
  activeChat,
  messages,
  showsLiveTurn,
  serverStreaming,
  respondingToToolUseId,
  onApprovePermission,
  onDenyPermission,
  onCreate,
}: MessageListProps) {
  // Capture the underlying scroller element so the jump-pill can scroll past
  // the Footer (where the streaming bubble lives). `virtuosoRef.scrollToIndex`
  // only reaches the last DATA row, which would land the user above the
  // streaming text — exactly the opposite of the affordance the pill exists
  // for. Native `scrollTo({ top: scrollHeight })` reaches the absolute bottom.
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Owning the streaming bubble (rather than receiving it through a render-prop)
  // keeps the Footer's identity stable when ChatPanel re-renders for unrelated
  // reasons (chat-list poll, stream start/end). An unstable Footer in
  // virtuoso's `components` map causes the Footer subtree to remount, which
  // would tear down and recreate `<StreamingBubble>`'s slice subscription —
  // exactly the cascade Phase 4 was meant to eliminate.
  const Footer = useCallback(
    () =>
      activeChat ? (
        <Box>
          <StreamingBubble
            chatId={activeChat}
            serverStreaming={serverStreaming}
            respondingToToolUseId={respondingToToolUseId}
            onApprove={onApprovePermission}
            onDeny={onDenyPermission}
          />
        </Box>
      ) : null,
    [activeChat, serverStreaming, respondingToToolUseId, onApprovePermission, onDenyPermission],
  );
  // Defensive: keep the `components` object identity stable when its members
  // don't change, so virtuoso doesn't churn its component machinery.
  const components = useMemo(() => ({ Footer }), [Footer]);

  const jumpToBottom = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  if (!activeChat) {
    return (
      <Center h={300} style={{ flex: 1 }}>
        <Stack align="center" gap="sm">
          <IconSparkles size={48} style={{ opacity: 0.15 }} />
          <Text size="sm" c="dimmed">
            Create a new chat to get started
          </Text>
          <Button
            size="sm"
            variant="light"
            color="brand"
            leftSection={<IconPlus size={14} />}
            onClick={onCreate}
          >
            New Chat
          </Button>
        </Stack>
      </Center>
    );
  }

  if (messages.length === 0 && !showsLiveTurn) {
    return (
      <Center h={300} style={{ flex: 1 }}>
        <Stack align="center" gap="sm">
          <IconSparkles size={48} style={{ opacity: 0.15 }} />
          <Text size="sm" c="dimmed">
            Send a message to start chatting
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Box style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
      <Virtuoso
        // Re-mount the virtualized list when the user switches chats. Without
        // this key, virtuoso reuses one instance and bleeds the previous
        // chat's scroll position into the new chat's first paint.
        key={activeChat}
        scrollerRef={(el) => {
          scrollerRef.current = el as HTMLElement | null;
        }}
        style={{ flex: 1 }}
        data={messages}
        computeItemKey={(_, msg) => msg.id}
        itemContent={(_, msg) => <ChatMessage message={msg} />}
        components={components}
        // Stick-to-bottom while at end. `followOutput` triggers on data-length
        // change; mid-stream Footer growth is handled by virtuoso's internal
        // SIZE_INCREASED auto-scroll (kicks in when the user is glued to
        // bottom). The "Writing" pill below covers the scrolled-up case.
        followOutput="smooth"
        atBottomStateChange={setAtBottom}
        atBottomThreshold={50}
        increaseViewportBy={{ top: 200, bottom: 600 }}
      />
      {!atBottom &&
        (showsLiveTurn ? (
          <Button
            onClick={jumpToBottom}
            size="compact-xs"
            radius="xl"
            variant="filled"
            color="blue"
            rightSection={<IconArrowDown size={12} />}
            aria-label="Jump to latest (assistant is writing)"
            style={{
              position: 'absolute',
              bottom: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 5,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
            }}
          >
            Writing
          </Button>
        ) : (
          <ActionIcon
            onClick={jumpToBottom}
            radius="xl"
            size="sm"
            variant="filled"
            color="gray"
            aria-label="Jump to latest"
            style={{
              position: 'absolute',
              bottom: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 5,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
            }}
          >
            <IconArrowDown size={12} />
          </ActionIcon>
        ))}
    </Box>
  );
}
