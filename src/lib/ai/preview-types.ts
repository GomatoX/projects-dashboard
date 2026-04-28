export type PreviewContentType = 'html' | 'markdown' | 'mermaid' | 'svg' | 'diff';

/** Shape of the `preview` SSE event written to the journal. */
export interface PreviewEvent {
  type: 'preview';
  /** Stable ID for the event record — last event wins on the client (no replace-by-id logic). */
  id: string;
  contentType: PreviewContentType;
  content: string;
  title?: string;
}

/** Per-chat preview state held in React (a snapshot of the last PreviewEvent). */
export interface PreviewState {
  id: string;
  contentType: PreviewContentType;
  content: string;
  title?: string;
}
