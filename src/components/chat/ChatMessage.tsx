'use client';

import { memo } from 'react';
import { Box, Group, Text, Badge, ThemeIcon, Anchor, Modal, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconUser, IconSparkles, IconFile, IconFileTypePdf } from '@tabler/icons-react';
import { MemoMarkdown } from './MemoMarkdown';

export interface ChatMsg {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  toolUses: string;
  proposedChanges: string;
  attachments: string;
  tokensIn?: number;
  tokensOut?: number;
  timestamp: string;
}

// Mirror of the metadata POST /attachments returns and ChatPanel persists.
// Stored as JSON-encoded text in chatMessages.attachments, so any field can
// be missing on legacy rows — the renderer below tolerates partial data.
interface StoredAttachment {
  id?: string;
  filename?: string;
  name?: string;
  type?: string;
  size?: number;
  url?: string;
}

interface ChatMessageProps {
  message: ChatMsg;
  isStreaming?: boolean;
}

// Parse the attachments column defensively — older rows have either '[]' or
// nothing, and a bad JSON payload should never break message rendering.
function parseAttachments(raw: string | null | undefined): StoredAttachment[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as StoredAttachment[]) : [];
  } catch {
    return [];
  }
}

export const ChatMessage = memo(
  function ChatMessageInner({ message, isStreaming }: ChatMessageProps) {
    const isUser = message.role === 'user';
    const attachments = parseAttachments(message.attachments);

    return (
      <Box
        py="sm"
        px="md"
        style={{
          backgroundColor: isUser ? 'transparent' : 'rgba(0, 200, 200, 0.03)',
          borderRadius: 'var(--mantine-radius-sm)',
          borderLeft: isUser
            ? '2px solid var(--mantine-color-dark-5)'
            : '2px solid var(--mantine-color-brand-8)',
        }}
      >
        <Group gap="sm" mb={6} wrap="nowrap" align="flex-start">
          {isUser ? (
            <ThemeIcon size={24} variant="light" color="gray" radius="xl">
              <IconUser size={12} />
            </ThemeIcon>
          ) : (
            <ThemeIcon size={24} variant="light" color="brand" radius="xl">
              <IconSparkles size={12} />
            </ThemeIcon>
          )}
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" mb={4}>
              <Text size="xs" fw={600} c={isUser ? 'gray.4' : 'brand.4'}>
                {isUser ? 'You' : 'Claude'}
              </Text>
              {!isUser && message.tokensIn != null && (
                <Badge size="xs" variant="outline" color="gray">
                  {message.tokensIn}↓ {message.tokensOut}↑
                </Badge>
              )}
              {isStreaming && (
                <Badge size="xs" variant="light" color="brand">
                  streaming…
                </Badge>
              )}
            </Group>

            {attachments.length > 0 && (
              <Group gap={6} mb={message.content ? 8 : 0} wrap="wrap">
                {attachments.map((att, idx) => (
                  <AttachmentTile key={att.id ?? idx} attachment={att} />
                ))}
              </Group>
            )}

            <Box className="chat-markdown" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
              <MemoMarkdown content={message.content} />
            </Box>
          </Box>
        </Group>
      </Box>
    );
  },
  (prev, next) =>
    prev.isStreaming === next.isStreaming &&
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.attachments === next.message.attachments &&
    prev.message.tokensIn === next.message.tokensIn &&
    prev.message.tokensOut === next.message.tokensOut,
);

// One thumbnail / chip per stored attachment. Images render as a clickable
// 80x80 preview that opens the full file in an in-app modal lightbox;
// everything else (PDF, txt, …) falls back to a labeled chip with the
// filename + size that opens in a new tab, since inlining 30 MB of PDF in
// chat history is rarely what the user wants.
function AttachmentTile({ attachment }: { attachment: StoredAttachment }) {
  const { url, type, name, size } = attachment;
  const [opened, { open, close }] = useDisclosure(false);
  if (!url) return null;
  const isImage = (type ?? '').startsWith('image/');
  const displayName = name ?? attachment.filename ?? 'file';

  if (isImage) {
    return (
      <>
        <UnstyledButton
          onClick={open}
          aria-label={`Open ${displayName}`}
          style={{
            display: 'block',
            borderRadius: 'var(--mantine-radius-sm)',
          }}
        >
          <Box
            style={{
              width: 80,
              height: 80,
              borderRadius: 'var(--mantine-radius-sm)',
              border: '1px solid var(--mantine-color-dark-5)',
              backgroundColor: 'var(--mantine-color-dark-7)',
              overflow: 'hidden',
              cursor: 'zoom-in',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={displayName}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </Box>
        </UnstyledButton>

        <Modal
          opened={opened}
          onClose={close}
          size="auto"
          centered
          withCloseButton
          padding={0}
          title={null}
          overlayProps={{ backgroundOpacity: 0.75, blur: 4 }}
          styles={{
            content: {
              backgroundColor: 'transparent',
              boxShadow: 'none',
            },
            header: {
              position: 'absolute',
              top: 8,
              right: 8,
              padding: 0,
              minHeight: 0,
              background: 'transparent',
              zIndex: 2,
            },
            body: {
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
            close: {
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              color: 'white',
            },
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={displayName}
            style={{
              display: 'block',
              maxWidth: '90vw',
              maxHeight: '90vh',
              width: 'auto',
              height: 'auto',
              borderRadius: 'var(--mantine-radius-sm)',
              cursor: 'zoom-out',
            }}
            onClick={close}
          />
        </Modal>
      </>
    );
  }

  const isPdf = type === 'application/pdf';
  return (
    <Anchor href={url} target="_blank" rel="noopener noreferrer" underline="never">
      <Group
        gap={8}
        wrap="nowrap"
        style={{
          padding: '6px 10px',
          borderRadius: 'var(--mantine-radius-sm)',
          border: '1px solid var(--mantine-color-dark-5)',
          backgroundColor: 'var(--mantine-color-dark-7)',
          maxWidth: 220,
        }}
      >
        {isPdf ? (
          <IconFileTypePdf size={16} color="var(--mantine-color-red-5)" />
        ) : (
          <IconFile size={16} />
        )}
        <Box style={{ minWidth: 0 }}>
          {/* `gray.2` is `#e9ecef` — invisible on white in light mode. Use the
              default body text color so this stays high-contrast in both
              schemes. */}
          <Text size="xs" lineClamp={1}>
            {displayName}
          </Text>
          {typeof size === 'number' && (
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
              {(size / 1024).toFixed(1)} KB
            </Text>
          )}
        </Box>
      </Group>
    </Anchor>
  );
}
