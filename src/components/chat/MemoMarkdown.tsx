// src/components/chat/MemoMarkdown.tsx
//
// Memoized + lazy-loaded ReactMarkdown body. The renderer-components map is
// large and the markdown parser is non-trivial, so we don't want to re-run
// either on every re-render of the surrounding ChatMessage.
//
// React Compiler note: we deliberately use `React.memo` here. The compiler
// will memoize calls inside a stable parent, but ChatMessage's `message`
// prop is a fresh reference on every parent re-render (messages.map
// rebuilds the array). `React.memo` with a single-string-prop comparator is
// the cleanest way to gate the markdown re-parse on `content` actually
// changing.

'use client';

import dynamic from 'next/dynamic';
import { memo, type ComponentProps } from 'react';
import { Box, Text, Badge } from '@mantine/core';
import remarkGfm from 'remark-gfm';

// Lazy chunk the markdown renderer so it doesn't bloat the initial chat
// panel JS. SSR is disabled (chat is a client-only feature anyway).
const ReactMarkdown = dynamic(() => import('react-markdown'), {
  ssr: false,
  loading: () => null, // visual gap is invisible — content is plain text until parsed
});

type Components = NonNullable<ComponentProps<typeof ReactMarkdown>['components']>;

const COMPONENTS: Components = {
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
    <Text component="p" size="sm" style={{ margin: '4px 0', lineHeight: 1.7 }}>
      {children}
    </Text>
  ),
  ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '4px 0' }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '4px 0' }}>{children}</ol>,
  li: ({ children }) => (
    <li style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 2 }}>{children}</li>
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
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
};

const REMARK_PLUGINS = [remarkGfm];

interface MemoMarkdownProps {
  content: string;
}

export const MemoMarkdown = memo(
  function MemoMarkdownInner({ content }: MemoMarkdownProps) {
    return (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    );
  },
  (prev, next) => prev.content === next.content,
);
