import { nanoid } from 'nanoid';
import { type PreviewContentType, type PreviewEvent } from './preview-types.js';

// Matches: ```preview-<type> [optional title]\n<content>``` on its own line.
// The `m` flag makes ^ match start-of-line so we don't accidentally match
// nested fences.  Lazy [\s\S]*? ensures the shortest possible content match,
// stopping at the first closing fence.
const FENCE_PATTERN =
  /^```(preview-(?:html|markdown|mermaid|svg|diff))(?:[ \t]+([^\n]*?))?[ \t]*\n([\s\S]*?)^```(?:[ \t]*)(?:\n|$)/gm;

export class PreviewDetector {
  /** Accumulated text across all deltas in this turn. */
  private accumulated = '';
  /** Number of preview blocks already emitted (prevents re-emitting on each delta). */
  private processedCount = 0;

  /**
   * Feed a text delta.  Returns any newly-completed preview blocks found
   * since the last call.  Call reset() between turns.
   */
  feed(delta: string): PreviewEvent[] {
    this.accumulated += delta;
    const events: PreviewEvent[] = [];

    // Must create a fresh RegExp each call — we can't reset lastIndex on
    // the module-level constant without mutating shared state.
    const re = new RegExp(FENCE_PATTERN.source, FENCE_PATTERN.flags);
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = re.exec(this.accumulated)) !== null) {
      count++;
      if (count > this.processedCount) {
        const [, lang, rawTitle, rawContent] = match;
        const contentType = lang.replace('preview-', '') as PreviewContentType;
        const title = rawTitle?.trim() || undefined;
        const content = rawContent.replace(/\n$/, ''); // strip single trailing newline
        events.push({ type: 'preview', id: nanoid(8), contentType, content, title });
        this.processedCount = count;
      }
    }

    return events;
  }

  /** Call at the start of each new assistant turn. */
  reset(): void {
    this.accumulated = '';
    this.processedCount = 0;
  }
}
