// src/components/chat/ChatList.tsx
'use client';

import { Box, Group, Stack, Text, Loader, ActionIcon, Tooltip, ScrollArea } from '@mantine/core';
import { IconPlus, IconMessageCircle, IconTrash } from '@tabler/icons-react';
import { useActiveStreamingChats } from './streaming-store';

export interface ChatListItem {
  id: string;
  title: string;
  estimatedCost: number;
  isStreaming?: boolean;
}

interface ChatListProps {
  items: ChatListItem[];
  activeId: string | null;
  /** Server-reported in-flight chat IDs (mirrors the panel's serverStreamingChats Set). */
  serverStreaming: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

export function ChatList({
  items,
  activeId,
  serverStreaming,
  onSelect,
  onDelete,
  onCreate,
}: ChatListProps) {
  const locallyStreaming = useActiveStreamingChats();
  return (
    <Box
      style={{
        width: 240,
        minWidth: 200,
        borderRight: '1px solid var(--mantine-color-dark-6)',
        backgroundColor: 'var(--mantine-color-dark-9)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack gap={0}>
        <Group
          gap="xs"
          px="sm"
          h={45}
          align="center"
          wrap="nowrap"
          style={{ borderBottom: '1px solid var(--mantine-color-dark-6)' }}
        >
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ flex: 1 }}>
            Chats
          </Text>
          <Tooltip label="New Chat">
            <ActionIcon variant="light" size="sm" color="brand" onClick={onCreate}>
              <IconPlus size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>

      <ScrollArea style={{ flex: 1 }} type="auto">
        <Stack gap={0} p={4}>
          {items.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="lg">
              No chats yet
            </Text>
          ) : (
            items.map((chat) => {
              const isStreaming =
                locallyStreaming.has(chat.id) ||
                serverStreaming.has(chat.id) ||
                Boolean(chat.isStreaming);
              return (
                <Box
                  key={chat.id}
                  w="100%"
                  py={8}
                  px={10}
                  onClick={() => onSelect(chat.id)}
                  style={{
                    borderRadius: 'var(--mantine-radius-sm)',
                    backgroundColor:
                      chat.id === activeId ? 'rgba(0, 200, 200, 0.08)' : 'transparent',
                    borderLeft:
                      chat.id === activeId
                        ? '2px solid var(--mantine-color-brand-5)'
                        : '2px solid transparent',
                    transition: 'background-color 0.1s',
                    cursor: 'pointer',
                  }}
                >
                  <Group gap={6} wrap="nowrap">
                    {isStreaming ? (
                      <Tooltip label="Chat is processing…" position="right" withArrow>
                        <Box
                          style={{
                            width: 12,
                            height: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Loader size={12} color="brand" type="oval" />
                        </Box>
                      </Tooltip>
                    ) : (
                      <IconMessageCircle
                        size={12}
                        style={{
                          opacity: chat.id === activeId ? 0.8 : 0.3,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <Text
                      size="xs"
                      lineClamp={1}
                      c={chat.id === activeId ? undefined : 'dimmed'}
                      fw={chat.id === activeId ? 600 : 400}
                      style={{ flex: 1 }}
                    >
                      {chat.title}
                    </Text>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size={16}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(chat.id);
                      }}
                      style={{ opacity: 0.3, flexShrink: 0 }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.3';
                      }}
                    >
                      <IconTrash size={10} />
                    </ActionIcon>
                  </Group>
                  {chat.estimatedCost > 0 && (
                    <Text size="xs" c="dimmed" mt={2} style={{ fontSize: 10 }}>
                      ${chat.estimatedCost.toFixed(4)}
                    </Text>
                  )}
                </Box>
              );
            })
          )}
        </Stack>
      </ScrollArea>
    </Box>
  );
}
