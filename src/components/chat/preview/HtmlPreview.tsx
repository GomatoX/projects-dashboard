'use client';

interface HtmlPreviewProps {
  content: string;
}

export function HtmlPreview({ content }: HtmlPreviewProps) {
  return (
    <iframe
      srcDoc={content}
      sandbox="allow-scripts"
      title="HTML Preview"
      style={{
        width: '100%',
        height: '100%',
        border: 0,
        display: 'block',
        background: '#fff',
      }}
    />
  );
}
