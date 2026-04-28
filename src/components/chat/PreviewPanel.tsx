'use client';

import { ActionIcon, Box, Group, Text, Tooltip } from '@mantine/core';
import {
  IconArrowsDiagonal,
  IconArrowsDiagonalMinimize2,
  IconX,
} from '@tabler/icons-react';
import { type PreviewState } from '@/lib/ai/preview-types';
import { DiffPreview } from './preview/DiffPreview';
import { HtmlPreview } from './preview/HtmlPreview';
import { MarkdownPreview } from './preview/MarkdownPreview';
import { MermaidPreview } from './preview/MermaidPreview';
import { SvgPreview } from './preview/SvgPreview';

interface PreviewPanelProps {
  preview: PreviewState;
  isExpanded: boolean;
  onClose: () => void;
  onToggleExpand: () => void;
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  html: 'HTML',
  markdown: 'Markdown',
  mermaid: 'Diagram',
  svg: 'SVG',
  diff: 'Diff',
};

export function PreviewPanel({
  preview,
  isExpanded,
  onClose,
  onToggleExpand,
}: PreviewPanelProps) {
  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Sized as a flex sibling of the chat column.  Expanded mode gives
        // the preview ~2/3 of the row, collapsed gives a balanced split.
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: isExpanded ? '66%' : '50%',
        minWidth: 320,
        height: '100%',
        minHeight: 0,
        borderLeft: '1px solid var(--mantine-color-dark-6)',
        background: 'var(--mantine-color-dark-7)',
        transition: 'flex-basis 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        wrap="nowrap"
        gap="xs"
        px="sm"
        py={6}
        style={{
          borderBottom: '1px solid var(--mantine-color-dark-5)',
          flexShrink: 0,
          background: 'var(--mantine-color-dark-8)',
        }}
      >
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Text
            size="xs"
            fw={600}
            c="dimmed"
            tt="uppercase"
            style={{ letterSpacing: 0.5, flexShrink: 0 }}
          >
            {CONTENT_TYPE_LABELS[preview.contentType] ?? preview.contentType}
          </Text>
          {preview.title && (
            <>
              <Text c="dimmed" size="xs" style={{ flexShrink: 0 }}>
                ·
              </Text>
              <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
                {preview.title}
              </Text>
            </>
          )}
        </Group>

        <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
          <Tooltip
            label={isExpanded ? 'Collapse preview' : 'Expand preview'}
            withArrow
          >
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              onClick={onToggleExpand}
              aria-label={isExpanded ? 'Collapse preview' : 'Expand preview'}
            >
              {isExpanded ? (
                <IconArrowsDiagonalMinimize2 size={14} />
              ) : (
                <IconArrowsDiagonal size={14} />
              )}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Close preview" withArrow>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              onClick={onClose}
              aria-label="Close preview"
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Content */}
      <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {preview.contentType === 'html' && <HtmlPreview content={preview.content} />}
        {preview.contentType === 'markdown' && (
          <MarkdownPreview content={preview.content} />
        )}
        {preview.contentType === 'mermaid' && (
          <MermaidPreview content={preview.content} />
        )}
        {preview.contentType === 'svg' && <SvgPreview content={preview.content} />}
        {preview.contentType === 'diff' && <DiffPreview content={preview.content} />}
      </Box>
    </Box>
  );
}
