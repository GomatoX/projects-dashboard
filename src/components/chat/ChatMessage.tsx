'use client';

import { Box, Group, Text, Badge, ThemeIcon, Anchor } from '@mantine/core';
import {
  IconUser,
  IconSparkles,
  IconFile,
  IconFileTypePdf,
} from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
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

          <Box
            className="chat-markdown"
            style={{ fontSize: 13.5, lineHeight: 1.7 }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const isInline = !match;

                  if (isInline) {
                    return (
                      <code
                        style={{
                          backgroundColor: 'var(--mantine-color-dark-6)',
                          padding: '1px 5px',
                          borderRadius: 3,
                          fontSize: '0.88em',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }

                  return (
                    <Box
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        border: '1px solid var(--mantine-color-dark-5)',
                        borderRadius: 'var(--mantine-radius-sm)',
                        padding: '12px 16px',
                        overflowX: 'auto',
                        margin: '8px 0',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.82em',
                        lineHeight: 1.6,
                      }}
                    >
                      {match && (
                        <Badge
                          size="xs"
                          variant="light"
                          color="gray"
                          mb="xs"
                          style={{ fontFamily: 'monospace', fontSize: 9 }}
                        >
                          {match[1]}
                        </Badge>
                      )}
                      <pre style={{ margin: 0 }}>
                        <code {...props}>{children}</code>
                      </pre>
                    </Box>
                  );
                },
                p: ({ children }) => (
                  <Text
                    component="p"
                    size="sm"
                    style={{ margin: '4px 0', lineHeight: 1.7 }}
                  >
                    {children}
                  </Text>
                ),
                ul: ({ children }) => (
                  <ul style={{ paddingLeft: 20, margin: '4px 0' }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ paddingLeft: 20, margin: '4px 0' }}>{children}</ol>
                ),
                li: ({ children }) => (
                  <li style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 2 }}>
                    {children}
                  </li>
                ),
                h1: ({ children }) => (
                  <Text fw={700} size="lg" mt="sm" mb="xs">
                    {children}
                  </Text>
                ),
                h2: ({ children }) => (
                  <Text fw={700} size="md" mt="sm" mb="xs">
                    {children}
                  </Text>
                ),
                h3: ({ children }) => (
                  <Text fw={600} size="sm" mt="xs" mb={4}>
                    {children}
                  </Text>
                ),
                blockquote: ({ children }) => (
                  <Box
                    style={{
                      borderLeft: '3px solid var(--mantine-color-brand-7)',
                      paddingLeft: 12,
                      margin: '8px 0',
                      opacity: 0.85,
                    }}
                  >
                    {children}
                  </Box>
                ),
                table: ({ children }) => (
                  <Box
                    style={{
                      overflowX: 'auto',
                      margin: '8px 0',
                      border: '1px solid var(--mantine-color-dark-5)',
                      borderRadius: 'var(--mantine-radius-xs)',
                    }}
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 13,
                      }}
                    >
                      {children}
                    </table>
                  </Box>
                ),
                th: ({ children }) => (
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      backgroundColor: 'var(--mantine-color-dark-6)',
                      borderBottom: '1px solid var(--mantine-color-dark-5)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td
                    style={{
                      padding: '5px 10px',
                      borderBottom: '1px solid var(--mantine-color-dark-6)',
                    }}
                  >
                    {children}
                  </td>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </Box>
        </Box>
      </Group>
    </Box>
  );
}

// One thumbnail / chip per stored attachment. Images render as a clickable
// 80x80 preview that opens the full file in a new tab; everything else
// (PDF, txt, …) falls back to a labeled chip with the filename + size, since
// inlining 30 MB of PDF in chat history is rarely what the user wants.
function AttachmentTile({ attachment }: { attachment: StoredAttachment }) {
  const { url, type, name, size } = attachment;
  if (!url) return null;
  const isImage = (type ?? '').startsWith('image/');
  const displayName = name ?? attachment.filename ?? 'file';

  if (isImage) {
    return (
      <Anchor href={url} target="_blank" rel="noopener noreferrer" underline="never">
        <Box
          style={{
            width: 80,
            height: 80,
            borderRadius: 'var(--mantine-radius-sm)',
            border: '1px solid var(--mantine-color-dark-5)',
            backgroundColor: 'var(--mantine-color-dark-7)',
            overflow: 'hidden',
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
      </Anchor>
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
