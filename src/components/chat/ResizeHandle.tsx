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
  /** Element whose width acts as the 100% reference. Usually the flex row. */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function ResizeHandle({ onResize, containerRef }: ResizeHandleProps) {
  const draggingRef = useRef(false);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // Mouse position in container → percent occupied by panel area.
      const panelPercent = ((rect.width - x) / rect.width) * 100;
      onResize(panelPercent);
    },
    [onResize, containerRef],
  );

  const onMouseUp = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onMouseMove, onMouseUp],
  );

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      style={{
        flexShrink: 0,
        flexGrow: 0,
        flexBasis: 4,
        height: '100%',
        cursor: 'col-resize',
        background: 'var(--mantine-color-dark-6)',
        // A wider invisible hit-target overlay would be ideal but adds
        // layout complexity; 4px is acceptable on a desktop dashboard.
      }}
    />
  );
}
