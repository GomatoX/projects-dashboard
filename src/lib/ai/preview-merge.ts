import {
  EMPTY_PREVIEW_STATE,
  type PreviewEvent,
  type PreviewItem,
  type PreviewState,
} from './preview-types';

/**
 * Merge a newly-arrived `PreviewEvent` into an existing `PreviewState`,
 * applying the title-based rule:
 *
 *   - If the event has a `title` and an existing item has the same title,
 *     update that item in place (content, contentType, updatedAt) and keep
 *     the existing id so the rail tab doesn't blink.
 *   - If the event has NO title, replace the existing untitled item (there
 *     is at most one untitled "slot") in place.
 *   - Otherwise, append a new item.
 *
 * The activeId is always set to the affected item — the panel switches to
 * show whatever just arrived.
 *
 * `now` is injected for testability; production callers pass `Date.now()`.
 */
export function mergePreviewItem(
  state: PreviewState,
  event: PreviewEvent,
  now: number,
): PreviewState {
  // Normalize: empty string and undefined are both "untitled" — they share
  // the single untitled slot and the rail's `title ?? "Untitled …"` fallback
  // would otherwise render an empty tooltip for `""`.
  const eventTitle = event.title?.trim() || undefined;

  const existingIdx = state.items.findIndex((it) =>
    eventTitle ? it.title === eventTitle : !it.title,
  );

  if (existingIdx >= 0) {
    const existing = state.items[existingIdx];
    // Identity short-circuit: if nothing user-visible changed, return the
    // same state object so callers (writePreview) and React keys (`${id}:${updatedAt}`)
    // don't trigger a re-render or remount the renderer (Mermaid in particular
    // re-runs layout on every remount).
    if (
      existing.content === event.content &&
      existing.contentType === event.contentType &&
      existing.title === eventTitle &&
      state.activeId === existing.id
    ) {
      return state;
    }
    const updated: PreviewItem = {
      // Keep id + createdAt so the rail icon stays stable across iterations.
      id: existing.id,
      createdAt: existing.createdAt,
      contentType: event.contentType,
      content: event.content,
      title: eventTitle,
      updatedAt: now,
    };
    const items = state.items.slice();
    items[existingIdx] = updated;
    return { items, activeId: updated.id };
  }

  const newItem: PreviewItem = {
    id: event.id,
    contentType: event.contentType,
    content: event.content,
    title: eventTitle,
    createdAt: now,
    updatedAt: now,
  };
  return { items: [...state.items, newItem], activeId: newItem.id };
}

/**
 * Remove an item by id. If the removed item was active, pick the next
 * neighbour to the right; if there is none, the next neighbour to the left;
 * if there are none at all, activeId becomes null.
 */
export function removePreviewItem(
  state: PreviewState,
  id: string,
): PreviewState {
  const idx = state.items.findIndex((it) => it.id === id);
  if (idx < 0) return state;

  const items = state.items.slice();
  items.splice(idx, 1);

  if (items.length === 0) return EMPTY_PREVIEW_STATE;
  if (state.activeId !== id) return { items, activeId: state.activeId };

  // Active was removed — pick neighbour. We removed at idx, so:
  //   - right neighbour now lives at the same idx (if any)
  //   - else fall back to idx - 1
  const next = items[idx] ?? items[idx - 1];
  return { items, activeId: next.id };
}
