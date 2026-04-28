'use client';

import { Maximize2, Minimize2, X } from 'lucide-react';
import { type PreviewState } from '@/lib/ai/preview-types';
import { DiffPreview } from './preview/DiffPreview';
import { HtmlPreview } from './preview/HtmlPreview';
import { MarkdownPreview } from './preview/MarkdownPreview';
import { MermaidPreview } from './preview/MermaidPreview';
import { SvgPreview } from './preview/SvgPreview';

interface PreviewPanelProps {
  preview: PreviewState;
  isExpanded: boolean;
  onClose: () => void;
  onToggleExpand: () => void;
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  html: 'HTML',
  markdown: 'Markdown',
  mermaid: 'Diagram',
  svg: 'SVG',
  diff: 'Diff',
};

export function PreviewPanel({ preview, isExpanded, onClose, onToggleExpand }: PreviewPanelProps) {
  return (
    <div
      className={[
        'flex flex-col border-l bg-background transition-all duration-200',
        isExpanded ? 'w-2/3' : 'w-1/2',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {CONTENT_TYPE_LABELS[preview.contentType] ?? preview.contentType}
        </span>
        {preview.title && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-sm font-medium truncate flex-1">{preview.title}</span>
          </>
        )}
        {!preview.title && <span className="flex-1" />}

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onToggleExpand}
            title={isExpanded ? 'Collapse preview' : 'Expand preview'}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onClose}
            title="Close preview"
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {preview.contentType === 'html' && <HtmlPreview content={preview.content} />}
        {preview.contentType === 'markdown' && <MarkdownPreview content={preview.content} />}
        {preview.contentType === 'mermaid' && <MermaidPreview content={preview.content} />}
        {preview.contentType === 'svg' && <SvgPreview content={preview.content} />}
        {preview.contentType === 'diff' && <DiffPreview content={preview.content} />}
      </div>
    </div>
  );
}
