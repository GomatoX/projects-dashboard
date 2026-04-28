'use client';

import { Typography } from '@mantine/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 16,
      }}
    >
      <Typography>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </Typography>
    </div>
  );
}
