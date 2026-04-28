import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergePreviewItem,
  removePreviewItem,
} from '../../../src/lib/ai/preview-merge';
import {
  EMPTY_PREVIEW_STATE,
  type PreviewEvent,
} from '../../../src/lib/ai/preview-types';

const ev = (overrides: Partial<PreviewEvent>): PreviewEvent => ({
  type: 'preview',
  id: 'e1',
  contentType: 'html',
  content: '<p>x</p>',
  ...overrides,
});

test('appends a new titled preview', () => {
  const next = mergePreviewItem(EMPTY_PREVIEW_STATE, ev({ id: 'a', title: 'Login' }), 1000);
  assert.equal(next.items.length, 1);
  assert.equal(next.items[0].id, 'a');
  assert.equal(next.items[0].title, 'Login');
  assert.equal(next.activeId, 'a');
});

test('updates in place when title matches', () => {
  const s1 = mergePreviewItem(EMPTY_PREVIEW_STATE, ev({ id: 'a', title: 'Login', content: 'v1' }), 1000);
  const s2 = mergePreviewItem(s1, ev({ id: 'b', title: 'Login', content: 'v2' }), 2000);
  assert.equal(s2.items.length, 1);
  // Keeps the original item id so the rail tab doesn't blink to a new icon.
  assert.equal(s2.items[0].id, 'a');
  assert.equal(s2.items[0].content, 'v2');
  assert.equal(s2.items[0].createdAt, 1000);
  assert.equal(s2.items[0].updatedAt, 2000);
  assert.equal(s2.activeId, 'a');
});

test('different titles create separate items', () => {
  const s1 = mergePreviewItem(EMPTY_PREVIEW_STATE, ev({ id: 'a', title: 'Login' }), 1000);
  const s2 = mergePreviewItem(s1, ev({ id: 'b', title: 'Signup' }), 2000);
  assert.equal(s2.items.length, 2);
  assert.deepEqual(s2.items.map((i) => i.title), ['Login', 'Signup']);
  assert.equal(s2.activeId, 'b');
});

test('untitled previews replace each other (single untitled slot)', () => {
  const s1 = mergePreviewItem(EMPTY_PREVIEW_STATE, ev({ id: 'a', content: 'first' }), 1000);
  const s2 = mergePreviewItem(s1, ev({ id: 'b', content: 'second' }), 2000);
  assert.equal(s2.items.length, 1);
  assert.equal(s2.items[0].content, 'second');
  // Same untitled-slot keeps the original id (so its rail icon doesn't blink).
  assert.equal(s2.items[0].id, 'a');
});

test('untitled does not collide with titled items', () => {
  const s1 = mergePreviewItem(EMPTY_PREVIEW_STATE, ev({ id: 'a', title: 'Login' }), 1000);
  const s2 = mergePreviewItem(s1, ev({ id: 'b', content: 'untitled' }), 2000);
  assert.equal(s2.items.length, 2);
  assert.equal(s2.activeId, 'b');
});

test('removePreviewItem keeps activeId on next neighbour', () => {
  let s = EMPTY_PREVIEW_STATE;
  s = mergePreviewItem(s, ev({ id: 'a', title: 'A' }), 1);
  s = mergePreviewItem(s, ev({ id: 'b', title: 'B' }), 2);
  s = mergePreviewItem(s, ev({ id: 'c', title: 'C' }), 3);
  // active is 'c'; remove 'b' → active stays 'c'
  const next = removePreviewItem(s, 'b');
  assert.equal(next.items.length, 2);
  assert.equal(next.activeId, 'c');
});

test('removePreviewItem on the active item picks the right neighbour, falling back left', () => {
  let s = EMPTY_PREVIEW_STATE;
  s = mergePreviewItem(s, ev({ id: 'a', title: 'A' }), 1);
  s = mergePreviewItem(s, ev({ id: 'b', title: 'B' }), 2);
  s = mergePreviewItem(s, ev({ id: 'c', title: 'C' }), 3);
  // Force active=b
  s = { ...s, activeId: 'b' };
  // remove b → next on right is c
  const removeB = removePreviewItem(s, 'b');
  assert.equal(removeB.activeId, 'c');
  // remove c (active) → falls back left to a (b is already gone)
  const removeC = removePreviewItem(removeB, 'c');
  assert.equal(removeC.activeId, 'a');
});

test('removing the last item leaves activeId null', () => {
  const s = mergePreviewItem(EMPTY_PREVIEW_STATE, ev({ id: 'a', title: 'A' }), 1);
  const next = removePreviewItem(s, 'a');
  assert.equal(next.items.length, 0);
  assert.equal(next.activeId, null);
});
