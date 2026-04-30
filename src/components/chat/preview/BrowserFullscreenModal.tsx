// src/components/chat/preview/BrowserFullscreenModal.tsx
//
// Fullscreen overlay for the browser preview. Covers the entire viewport
// (Mantine fullScreen Modal handles that), gives the browser frame the most
// space possible, and floats a collapsible chat composer at the bottom-right
// so the user can keep messaging without exiting.
//
// ESC closes the modal (Mantine default).

'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Box,
  Group,
  Modal,
  Paper,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconMessageCircle,
} from '@tabler/icons-react';
import { ChatInput, type PendingAttachment } from '../ChatInput';
import { BrowserPreview } from './BrowserPreview';

interface BrowserFullscreenModalProps {
  opened: boolean;
  chatId: string;
  /** Forwarded to <BrowserPreview> for one-shot snapshot fetches. */
  projectId?: string;
  /** Header label. Typically the chat title; falls back to "Browser preview". */
  title?: string;
  inputDisabled?: boolean;
  onSend: (content: string, attachments: PendingAttachment[]) => void;
  onClose: () => void;
}

export function BrowserFullscreenModal({
  opened,
  chatId,
  projectId,
  title,
  inputDisabled,
  onSend,
  onClose,
}: BrowserFullscreenModalProps) {
  // The composer starts expanded — that's the point of having it. Users who
  // want pixel-pure focus can collapse it to a floating bubble.
  const [composerOpen, setComposerOpen] = useState(true);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      withCloseButton
      title={
        <Group gap={8} wrap="nowrap">
          <Text size="sm" fw={600}>
            {title ?? 'Browser preview'}
          </Text>
          <Text size="xs" c="dimmed">
            ESC to exit
          </Text>
        </Group>
      }
      padding={0}
      styles={{
        // Flex column on the modal content lets the body claim all leftover
        // space without pinning to a magic header height (which can grow if
        // the title wraps or Mantine's theme scale changes).
        content: { display: 'flex', flexDirection: 'column', height: '100dvh' },
        header: {
          flexShrink: 0,
          borderBottom: '1px solid var(--mantine-color-dark-5)',
        },
        body: {
          flex: 1,
          minHeight: 0,
          padding: 0,
          position: 'relative',
          overflow: 'hidden',
        },
      }}
    >
      <Box style={{ position: 'relative', height: '100%', minHeight: 0 }}>
        <BrowserPreview chatId={chatId} projectId={projectId} />

        {/* Floating composer — bottom-right so it doesn't cover the URL bar. */}
        <Paper
          shadow="lg"
          radius="md"
          withBorder
          style={{
            position: 'absolute',
            right: 16,
            bottom: 16,
            // Cap width so the composer never spans the whole viewport.
            width: composerOpen ? 'min(560px, calc(100vw - 32px))' : 'auto',
            background: 'var(--mantine-color-dark-7)',
            overflow: 'hidden',
            zIndex: 5,
          }}
        >
          <Group
            justify="space-between"
            wrap="nowrap"
            px="sm"
            py={6}
            gap="xs"
            // Whole header bar is clickable and keyboard-activatable. The
            // ActionIcon below uses stopPropagation so its own click doesn't
            // double-fire this handler.
            role="button"
            tabIndex={0}
            aria-expanded={composerOpen}
            aria-label={composerOpen ? 'Collapse chat composer' : 'Expand chat composer'}
            style={{
              borderBottom: composerOpen
                ? '1px solid var(--mantine-color-dark-5)'
                : 'none',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setComposerOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setComposerOpen((v) => !v);
              }
            }}
          >
            <Group gap={6} wrap="nowrap">
              <IconMessageCircle size={14} />
              <Text size="xs" fw={500}>
                {composerOpen ? 'Chat' : 'Open chat'}
              </Text>
            </Group>
            <Tooltip
              label={composerOpen ? 'Collapse' : 'Expand'}
              withArrow
              position="left"
            >
              <ActionIcon
                variant="subtle"
                size="sm"
                color="gray"
                aria-label={composerOpen ? 'Collapse chat composer' : 'Expand chat composer'}
                // Click bubbles up to the Group; keep both behaviours in sync.
                onClick={(e) => {
                  e.stopPropagation();
                  setComposerOpen((v) => !v);
                }}
              >
                {composerOpen ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
              </ActionIcon>
            </Tooltip>
          </Group>
          {composerOpen && <ChatInput onSend={onSend} disabled={inputDisabled} />}
        </Paper>
      </Box>
    </Modal>
  );
}
