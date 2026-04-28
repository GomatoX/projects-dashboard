'use client';

import { Box } from '@mantine/core';
import { useCallback, useRef } from 'react';

interface ResizeHandleProps {
  /**
   * Called continuously during the drag. The argument is the panel-content
   * width as a percentage of `containerEl`'s width — i.e. `100 - chat%`.
   * Parent decides clamping and persistence.
   */
  onResize: (panelPercent: number) => void;
  /**
   * Element whose width acts as the 100% reference. Must contain ONLY the
   * resizable siblings (chat-area, the handle itself, and the preview panel)
   * — anything else (e.g. the preview rail) will throw the math off.
   */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Optional callbacks so the parent can disable transitions during drag. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const HANDLE_WIDTH = 6;

export function ResizeHandle({
  onResize,
  containerRef,
  onDragStart,
  onDragEnd,
}: ResizeHandleProps) {
  const draggingRef = useRef(false);
  // Offset within the handle where the user originally clicked. Without this,
  // mousedown at, say, the right edge of a 6px handle would snap the handle
  // ~6px to the right because the panel edge would be set to clientX.
  const grabOffsetRef = useRef(0);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // The panel's left edge should sit at: cursor − grabOffset + handleWidth.
      // So the panel width is (rect.right − panelLeft).
      const panelLeft = e.clientX - grabOffsetRef.current + HANDLE_WIDTH;
      const panelWidth = rect.right - panelLeft;
      const panelPercent = (panelWidth / rect.width) * 100;
      onResize(panelPercent);
    },
    [onResize, containerRef],
  );

  const onMouseUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    onDragEnd?.();
  }, [onMouseMove, onDragEnd]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handleRect = e.currentTarget.getBoundingClientRect();
      grabOffsetRef.current = e.clientX - handleRect.left;
      draggingRef.current = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      onDragStart?.();
    },
    [onMouseMove, onMouseUp, onDragStart],
  );

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      style={{
        flexShrink: 0,
        flexGrow: 0,
        flexBasis: HANDLE_WIDTH,
        height: '100%',
        cursor: 'col-resize',
        background: 'var(--mantine-color-dark-6)',
        // Note: containerRef MUST exclude any non-resizable siblings (e.g.
        // the preview rail). If extra fixed-width siblings are inside the
        // measured container, the handle will drift from the cursor.
      }}
    />
  );
}
