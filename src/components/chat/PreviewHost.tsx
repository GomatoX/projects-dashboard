// src/components/chat/PreviewHost.tsx
//
// Renders the resizable preview panel for ONE chatId. Subscribes to its
// chat's preview slice via the preview store; preview events on a different
// chat do not wake this component. Open/expanded state is owned by the
// parent ChatPanel so the rail and the panel share a single source of truth.

'use client';

import { useCallback, useState, type RefObject } from 'react';
import { useLocalStorage } from '@mantine/hooks';
import { Box } from '@mantine/core';
import { PreviewPanel } from './PreviewPanel';
import { PreviewRail } from './PreviewRail';
import { ResizeHandle } from './ResizeHandle';
import { usePreviewSlice, writePreview } from './preview-store';

interface PreviewHostProps {
  chatId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  expanded: boolean;
  onClose: () => void;
  onToggleExpand: () => void;
}

export function PreviewHost({
  chatId,
  containerRef,
  open,
  expanded,
  onClose,
  onToggleExpand,
}: PreviewHostProps) {
  const previewState = usePreviewSlice(chatId);
  const activeItem = previewState.items.find((i) => i.id === previewState.activeId) ?? null;

  const [splitPercentRaw, setSplitPercentRaw] = useLocalStorage<number>({
    key: 'chat:previewSplitPercent',
    defaultValue: 50,
  });
  const splitPercent = Math.min(
    80,
    Math.max(20, Number.isFinite(splitPercentRaw) ? splitPercentRaw : 50),
  );
  const setSplitPercent = useCallback(
    (next: number) => {
      const safe = Number.isFinite(next) ? next : 50;
      setSplitPercentRaw(Math.min(80, Math.max(20, safe)));
    },
    [setSplitPercentRaw],
  );

  // Disable the flex-basis transition during active drag (same trick as the
  // original ChatPanel). Local to the host since only the resize handle
  // cares about it.
  const [isResizing, setIsResizing] = useState(false);

  if (!open || !activeItem) return null;

  return (
    <>
      <ResizeHandle
        onResize={setSplitPercent}
        containerRef={containerRef}
        onDragStart={() => setIsResizing(true)}
        onDragEnd={() => setIsResizing(false)}
      />
      <Box
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: `${expanded ? Math.max(splitPercent, 66) : splitPercent}%`,
          minWidth: 280,
          height: '100%',
          minHeight: 0,
          borderLeft: '1px solid var(--mantine-color-dark-6)',
          background: 'var(--mantine-color-dark-7)',
          transition: isResizing ? 'none' : 'flex-basis 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
        }}
      >
        <PreviewPanel
          key={activeItem.id}
          item={activeItem}
          chatId={chatId}
          isExpanded={expanded}
          onClosePanel={onClose}
          onToggleExpand={onToggleExpand}
        />
      </Box>
    </>
  );
}

interface PreviewRailHostProps {
  chatId: string;
  panelOpen: boolean;
  onSelect: () => void; // parent-driven: ensure panel is open after a rail click
  onTogglePanel: () => void;
}

export function PreviewRailHost({
  chatId,
  panelOpen,
  onSelect,
  onTogglePanel,
}: PreviewRailHostProps) {
  const previewState = usePreviewSlice(chatId);
  if (previewState.items.length === 0) return null;
  return (
    <PreviewRail
      items={previewState.items}
      activeId={previewState.activeId}
      panelOpen={panelOpen}
      onSelect={(id) => {
        writePreview(chatId, (prev) => ({ ...prev, activeId: id }));
        onSelect();
      }}
      onTogglePanel={onTogglePanel}
    />
  );
}
