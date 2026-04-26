'use client';

import { Box, Group, Text, Avatar, Badge, ThemeIcon } from '@mantine/core';
import { IconUser, IconSparkles } from '@tabler/icons-react';
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

interface ChatMessageProps {
  message: ChatMsg;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';

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
              <Badge size="xs" variant="outline" color="dark.4">
                {message.tokensIn}↓ {message.tokensOut}↑
              </Badge>
            )}
            {isStreaming && (
              <Badge size="xs" variant="light" color="brand">
                streaming…
              </Badge>
            )}
          </Group>

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
                          color="dark.3"
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
