'use client';

import DOMPurify from 'dompurify';

interface SvgPreviewProps {
  content: string;
}

export function SvgPreview({ content }: SvgPreviewProps) {
  // Sanitize before injecting — even though content comes from Claude, prompt
  // injection via project files could cause Claude to emit harmful SVG with
  // script payloads that would execute in the parent document context.
  const clean = DOMPurify.sanitize(content, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
  return (
    <div
      style={{
        height: '100%',
        padding: 16,
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        background: '#fff',
      }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
