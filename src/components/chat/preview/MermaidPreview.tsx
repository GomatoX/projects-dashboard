'use client';

import { useEffect, useRef } from 'react';

interface MermaidPreviewProps {
  content: string;
}

// Lazy-initialised once; avoids repeated mermaid.initialize() calls.
let mermaidReady = false;

export function MermaidPreview({ content }: MermaidPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    (async () => {
      const mermaid = (await import('mermaid')).default;

      if (!mermaidReady) {
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
        mermaidReady = true;
      }

      // Unique ID required by mermaid.render()
      const id = `mermaid-preview-${Math.random().toString(36).slice(2, 9)}`;

      try {
        const { svg } = await mermaid.render(id, content);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled && containerRef.current) {
          containerRef.current.textContent = `Diagram error: ${(err as Error).message}`;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [content]);

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        padding: 16,
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        background: '#fff',
      }}
    />
  );
}
