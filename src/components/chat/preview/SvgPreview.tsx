'use client';

interface SvgPreviewProps {
  content: string;
}

export function SvgPreview({ content }: SvgPreviewProps) {
  return (
    <div
      className="p-4 flex justify-center items-start overflow-auto h-full [&_svg]:max-w-full"
      // SVG from Claude is treated as trusted content (same-origin dashboard).
      // If this panel were ever exposed to untrusted input, sanitise here.
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
