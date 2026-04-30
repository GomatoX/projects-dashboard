// Run with: pnpm exec tsx src/components/chat/__smoke__/preview-store.smoke.ts

import { EMPTY_PREVIEW_STATE } from '@/lib/ai/preview-types';
import { mergePreviewItem } from '@/lib/ai/preview-merge';
import {
  clearPreview,
  hasPreview,
  readPreview,
  writePreview,
} from '../preview-store';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// 1. Empty before any writes
assert(readPreview('a') === EMPTY_PREVIEW_STATE, 'empty slice for unknown chat');
assert(!hasPreview('a'), 'hasPreview is false initially');

// 2. writePreview short-circuits when mut returns prev
writePreview('a', (p) => p);
assert(readPreview('a') === EMPTY_PREVIEW_STATE, 'identity write is a no-op');
assert(!hasPreview('a'), 'no slice created for identity write');

// 3. Real write produces a new slice
writePreview('a', (p) =>
  mergePreviewItem(
    p,
    { type: 'preview', id: 'p1', contentType: 'markdown', content: '# hi', title: 'T' },
    1,
  ),
);
const a1 = readPreview('a');
assert(a1 !== EMPTY_PREVIEW_STATE, 'write produced a slice');
assert(a1.items.length === 1, 'one item');
assert(hasPreview('a'), 'hasPreview now true');

// 4. Per-chat isolation
writePreview('b', (p) =>
  mergePreviewItem(
    p,
    { type: 'preview', id: 'p2', contentType: 'svg', content: '<svg/>', title: 'B' },
    1,
  ),
);
assert(readPreview('a').items[0].id === 'p1', 'chat a unaffected');
assert(readPreview('b').items[0].id === 'p2', 'chat b independent');

// 5. clearPreview removes the slice
clearPreview('a');
assert(readPreview('a') === EMPTY_PREVIEW_STATE, 'clear restored empty');
assert(!hasPreview('a'), 'hasPreview false after clear');

console.log('preview-store smoke OK');
