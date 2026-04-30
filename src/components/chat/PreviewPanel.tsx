'use client';

import { ActionIcon, Box, Group, Text, Tooltip } from '@mantine/core';
import {
  IconArrowsDiagonal,
  IconArrowsDiagonalMinimize2,
  IconExternalLink,
  IconMaximize,
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
  /** Browser-only: open the in-page fullscreen modal. */
  onOpenBrowserFullscreen?: () => void;
  /** Browser-only: pop the browser preview out into a separate window. */
  onOpenBrowserPopout?: () => void;
  /** Browser-only: when true, renders the "popped out" placeholder
   *  instead of <BrowserPreview>. */
  browserPoppedOut?: boolean;
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
  onOpenBrowserFullscreen,
  onOpenBrowserPopout,
  browserPoppedOut,
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
          {item.contentType === 'browser' && onOpenBrowserFullscreen && (
            <Tooltip label="Fullscreen browser" withArrow>
              <ActionIcon
                variant="subtle"
                size="sm"
                color="gray"
                onClick={onOpenBrowserFullscreen}
                aria-label="Fullscreen browser"
              >
                <IconMaximize size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {item.contentType === 'browser' && onOpenBrowserPopout && (
            <Tooltip
              label={browserPoppedOut ? 'Browser is in another window' : 'Open in new window'}
              withArrow
            >
              <ActionIcon
                variant="subtle"
                size="sm"
                color={browserPoppedOut ? 'brand' : 'gray'}
                onClick={onOpenBrowserPopout}
                aria-label={
                  browserPoppedOut ? 'Browser is in another window' : 'Open in new window'
                }
                aria-pressed={browserPoppedOut}
              >
                <IconExternalLink size={14} />
              </ActionIcon>
            </Tooltip>
          )}
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
        {item.contentType === 'browser' &&
          (browserPoppedOut ? (
            <BrowserPoppedOutPlaceholder onFocus={onOpenBrowserPopout} />
          ) : (
            <BrowserPreview chatId={chatId} />
          ))}
      </Box>
    </Box>
  );
}

function BrowserPoppedOutPlaceholder({ onFocus }: { onFocus?: () => void }) {
  return (
    <Box
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <Text size="sm" c="dimmed">
        Browser preview is in a separate window.
      </Text>
      {onFocus && (
        <ActionIcon
          variant="light"
          size="lg"
          color="brand"
          onClick={onFocus}
          aria-label="Focus popped-out browser window"
        >
          <IconExternalLink size={16} />
        </ActionIcon>
      )}
      <Text size="xs" c="dimmed">
        Close that window to bring the browser back here.
      </Text>
    </Box>
  );
}
