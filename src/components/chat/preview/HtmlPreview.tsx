'use client';

interface HtmlPreviewProps {
  content: string;
}

export function HtmlPreview({ content }: HtmlPreviewProps) {
  return (
    <iframe
      srcDoc={content}
      sandbox="allow-scripts allow-same-origin"
      className="w-full h-full border-0"
      title="HTML Preview"
    />
  );
}
