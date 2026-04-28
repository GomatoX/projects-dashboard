'use client';

interface DiffPreviewProps {
  content: string;
}

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-muted-foreground font-semibold';
  if (line.startsWith('+')) return 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300';
  if (line.startsWith('-')) return 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300';
  if (line.startsWith('@@')) return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
  return '';
}

export function DiffPreview({ content }: DiffPreviewProps) {
  const lines = content.split('\n');
  return (
    <pre className="p-4 text-xs font-mono overflow-auto h-full leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className={lineClass(line)}>
          {line || ' '}
        </div>
      ))}
    </pre>
  );
}
