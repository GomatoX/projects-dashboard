// src/components/chat/StreamingBubble.tsx
//
// Renders the live streaming assistant bubble + inline tool activity badges
// + pending permission requests for ONE chatId. Subscribes to the chat's
// streaming slice via `useChatStreamSlice`, which means a token delta wakes
// only this tree — not the chat list, header, composer, or any prior
// persisted message.

'use client';

import { Box, Group, Loader, Text } from '@mantine/core';
import { ChatMessage } from './ChatMessage';
import { ToolActivityBadge, ToolApprovalCard, type PermissionRequest } from './ToolApprovalCard';
import { useChatStreamSlice } from './streaming-store';

interface StreamingBubbleProps {
  chatId: string;
  /** True when the SERVER reports a turn in flight but THIS tab isn't driving it. */
  serverStreaming: boolean;
  respondingToToolUseId: string | null;
  onApprove: (toolUseId: string) => void;
  onDeny: (toolUseId: string) => void;
}

export function StreamingBubble({
  chatId,
  serverStreaming,
  respondingToToolUseId,
  onApprove,
  onDeny,
}: StreamingBubbleProps) {
  const slice = useChatStreamSlice(chatId);
  const showsLiveTurn = slice.active || serverStreaming;
  if (!showsLiveTurn && slice.permissions.length === 0) return null;

  return (
    <>
      {showsLiveTurn && (
        <>
          {slice.toolActivities.length > 0 && (
            <Box px="md" py={4}>
              {slice.toolActivities.map((ta) => (
                <ToolActivityBadge key={ta.id} activity={ta} />
              ))}
            </Box>
          )}
          {slice.content ? (
            <ChatMessage
              message={{
                id: 'streaming',
                chatId,
                role: 'assistant',
                content: slice.content,
                toolUses: '[]',
                proposedChanges: '[]',
                attachments: '[]',
                timestamp: new Date().toISOString(),
              }}
              isStreaming
            />
          ) : (
            <Box px="md" py="sm">
              <Group gap="xs">
                <Loader size={14} color="brand" type="dots" />
                <Text size="xs" c="dimmed" fs="italic">
                  {slice.toolActivities.length > 0 ? 'Working...' : 'Thinking...'}
                </Text>
              </Group>
            </Box>
          )}
        </>
      )}
      {slice.permissions.length > 0 && (
        <Box px="xs" py={4}>
          {slice.permissions.map((perm: PermissionRequest) => (
            <ToolApprovalCard
              key={perm.toolUseId}
              permission={perm}
              onApprove={onApprove}
              onDeny={onDeny}
              loading={respondingToToolUseId === perm.toolUseId}
            />
          ))}
        </Box>
      )}
    </>
  );
}
