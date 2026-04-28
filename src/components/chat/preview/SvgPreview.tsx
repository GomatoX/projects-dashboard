'use client';

import DOMPurify from 'dompurify';

interface SvgPreviewProps {
  content: string;
}

export function SvgPreview({ content }: SvgPreviewProps) {
  // Sanitize before injecting — even though content comes from Claude, prompt
  // injection via project files could cause Claude to emit harmful SVG with
  // script payloads that would execute in the parent document context.
  const clean = DOMPurify.sanitize(content, { USE_PROFILES: { svg: true, svgFilters: true } });
  return (
    <div
      className="p-4 flex justify-center items-start overflow-auto h-full [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
