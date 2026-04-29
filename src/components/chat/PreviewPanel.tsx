'use client';

import { ActionIcon, Box, Group, Text, Tooltip } from '@mantine/core';
import {
  IconArrowsDiagonal,
  IconArrowsDiagonalMinimize2,
  IconX,
} from '@tabler/icons-react';
import { type PreviewItem } from '@/lib/ai/preview-types';
import { BrowserPreview } from './preview/BrowserPreview';
import { DiffPreview } from './preview/DiffPreview';
import { HtmlPreview } from './preview/HtmlPreview';
import { MarkdownPreview } from './preview/MarkdownPreview';
import { MermaidPreview } from './preview/MermaidPreview';
import { SvgPreview } from './preview/SvgPreview';

interface PreviewPanelProps {
  item: PreviewItem;
  chatId: string;
  isExpanded: boolean;
  /** Close the entire panel (rail stays visible if items.length > 0). */
  onClosePanel: () => void;
  onToggleExpand: () => void;
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  html: 'HTML',
  markdown: 'Markdown',
  mermaid: 'Diagram',
  svg: 'SVG',
  diff: 'Diff',
  browser: 'Browser',
};

export function PreviewPanel({
  item,
  chatId,
  isExpanded,
  onClosePanel,
  onToggleExpand,
}: PreviewPanelProps) {
  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        height: '100%',
        minHeight: 0,
        background: 'var(--mantine-color-dark-7)',
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
            {CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType}
          </Text>
          {item.title && (
            <>
              <Text c="dimmed" size="xs" style={{ flexShrink: 0 }}>
                ·
              </Text>
              <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
                {item.title}
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
              onClick={onClosePanel}
              aria-label="Close preview"
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Content — keyed by item.id + updatedAt so the renderer remounts on
          updates within the same item (matches the v1 `previewRevision` trick). */}
      <Box
        key={`${item.id}:${item.updatedAt}`}
        style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
      >
        {item.contentType === 'html' && <HtmlPreview content={item.content} />}
        {item.contentType === 'markdown' && (
          <MarkdownPreview content={item.content} />
        )}
        {item.contentType === 'mermaid' && (
          <MermaidPreview content={item.content} />
        )}
        {item.contentType === 'svg' && <SvgPreview content={item.content} />}
        {item.contentType === 'diff' && <DiffPreview content={item.content} />}
        {item.contentType === 'browser' && <BrowserPreview chatId={chatId} />}
      </Box>
    </Box>
  );
}
