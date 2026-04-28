'use client';

import { Box, Stack, Tooltip } from '@mantine/core';
import {
  IconBrandHtml5,
  IconChartDots3,
  IconFileText,
  IconGitCompare,
  IconPhoto,
  type IconProps,
} from '@tabler/icons-react';
import { type ComponentType } from 'react';
import {
  type PreviewContentType,
  type PreviewItem,
} from '@/lib/ai/preview-types';

interface PreviewRailProps {
  items: PreviewItem[];
  activeId: string | null;
  /** Whether the panel content is currently visible. Affects click semantics. */
  panelOpen: boolean;
  onSelect: (id: string) => void;
  /** Toggle the panel (open/close) without changing the active item. */
  onTogglePanel: () => void;
}

const ICONS: Record<PreviewContentType, ComponentType<IconProps>> = {
  html: IconBrandHtml5,
  markdown: IconFileText,
  mermaid: IconChartDots3,
  svg: IconPhoto,
  diff: IconGitCompare,
};

const TYPE_LABEL: Record<PreviewContentType, string> = {
  html: 'HTML',
  markdown: 'Markdown',
  mermaid: 'Diagram',
  svg: 'SVG',
  diff: 'Diff',
};

export function PreviewRail({
  items,
  activeId,
  panelOpen,
  onSelect,
  onTogglePanel,
}: PreviewRailProps) {
  if (items.length === 0) return null;
  return (
    <Box
      role="tablist"
      aria-label="Preview tabs"
      style={{
        flexShrink: 0,
        flexGrow: 0,
        flexBasis: 44,
        width: 44,
        height: '100%',
        borderLeft: '1px solid var(--mantine-color-dark-6)',
        background: 'var(--mantine-color-dark-8)',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
      }}
    >
      <Stack gap={4} p={4} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {items.map((item) => {
          const Icon = ICONS[item.contentType];
          const isActive = item.id === activeId;
          const label =
            item.title ??
            `Untitled ${TYPE_LABEL[item.contentType] ?? item.contentType}`;
          const handleClick = () => {
            if (isActive && panelOpen) {
              onTogglePanel();
              return;
            }
            onSelect(item.id);
          };
          return (
            <Tooltip key={item.id} label={label} position="left" withArrow>
              <Box
                role="tab"
                aria-selected={isActive}
                aria-label={label}
                onClick={handleClick}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background:
                    isActive && panelOpen
                      ? 'var(--mantine-color-dark-5)'
                      : 'transparent',
                  border: isActive
                    ? '1px solid var(--mantine-color-dark-4)'
                    : '1px solid transparent',
                  color: isActive
                    ? 'var(--mantine-color-text)'
                    : 'var(--mantine-color-dimmed)',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} stroke={1.6} />
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
    </Box>
  );
}
