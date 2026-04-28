// src/lib/ai/preview-types.ts
export type PreviewContentType = 'html' | 'markdown' | 'mermaid' | 'svg' | 'diff';

/** Shape of the `preview` SSE event written to the journal. */
export interface PreviewEvent {
  type: 'preview';
  /** Stable ID for the event record. */
  id: string;
  contentType: PreviewContentType;
  content: string;
  title?: string;
}

/** A single preview held in the panel. Multiple items live side-by-side; the rail switches between them. */
export interface PreviewItem {
  id: string;
  contentType: PreviewContentType;
  content: string;
  title?: string;
  /** Wall-clock ms when the item was first created. Used only for stable rail ordering. */
  createdAt: number;
  /** Wall-clock ms of the most recent update (helpful for debugging / future "recently updated" UI). */
  updatedAt: number;
}

/** Per-chat preview state held in React. Multiple items + a single active id. */
export interface PreviewState {
  items: PreviewItem[];
  activeId: string | null;
}

/** Convenience: an empty state. Useful as a default when the chat has never had a preview. */
export const EMPTY_PREVIEW_STATE: PreviewState = { items: [], activeId: null };
