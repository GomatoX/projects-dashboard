'use client';

import { CSSProperties } from 'react';

interface DiffPreviewProps {
  content: string;
}

const STYLES: Record<string, CSSProperties> = {
  base: {
    margin: 0,
    padding: 16,
    height: '100%',
    overflow: 'auto',
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    lineHeight: 1.5,
    background: 'var(--mantine-color-dark-7)',
  },
  header: {
    color: 'var(--mantine-color-dark-2)',
    fontWeight: 600,
  },
  add: {
    background: 'light-dark(rgba(64, 192, 87, 0.12), rgba(64, 192, 87, 0.18))',
    color: 'light-dark(#0d6c2c, #8ce99a)',
  },
  del: {
    background: 'light-dark(rgba(250, 82, 82, 0.10), rgba(250, 82, 82, 0.18))',
    color: 'light-dark(#a8071a, #ffa8a8)',
  },
  hunk: {
    background: 'light-dark(rgba(34, 139, 230, 0.10), rgba(34, 139, 230, 0.18))',
    color: 'light-dark(#1864ab, #74c0fc)',
  },
};

function styleFor(line: string): CSSProperties | undefined {
  if (line.startsWith('+++') || line.startsWith('---')) return STYLES.header;
  if (line.startsWith('+')) return STYLES.add;
  if (line.startsWith('-')) return STYLES.del;
  if (line.startsWith('@@')) return STYLES.hunk;
  return undefined;
}

export function DiffPreview({ content }: DiffPreviewProps) {
  const lines = content.split('\n');
  return (
    <pre style={STYLES.base}>
      {lines.map((line, i) => (
        <div key={i} style={styleFor(line)}>
          {line || ' '}
        </div>
      ))}
    </pre>
  );
}
