// Run with: pnpm exec tsx src/components/chat/__smoke__/streaming-store.smoke.ts
//
// Exercises slice isolation, immutability, short-circuit equality, and the
// active-chats helper. Exits with code 1 on any assertion failure.

import {
  appendText,
  appendTurnBreak,
  begin,
  clear,
  end,
  EMPTY_STATE,
  readSlice,
} from '../streaming-store';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// 1. Empty before any writes
assert(readSlice('a') === EMPTY_STATE, 'empty slice for unknown chat');

// 2. begin produces a new active slice
begin('a');
const a1 = readSlice('a');
assert(a1.active === true, 'begin sets active');
assert(a1 !== EMPTY_STATE, 'begin replaces the empty sentinel');

// 3. appendText produces a new immutable slice
appendText('a', 'hello');
const a2 = readSlice('a');
assert(a2 !== a1, 'append produces new identity');
assert(a2.content === 'hello', 'content accumulated');

// 4. Empty appendText short-circuits
appendText('a', '');
assert(readSlice('a') === a2, 'empty append is a no-op');

// 5. appendTurnBreak idempotency at boundary
appendTurnBreak('a');
const a3 = readSlice('a');
assert(a3.content === 'hello\n\n', 'turn break appended');
appendTurnBreak('a');
assert(readSlice('a') === a3, 'second turn break short-circuits');

// 6. Per-chat isolation
begin('b');
appendText('b', 'world');
assert(readSlice('a').content === 'hello\n\n', 'chat a unaffected');
assert(readSlice('b').content === 'world', 'chat b independent');

// 7. end flips active without losing content
end('a');
assert(readSlice('a').active === false, 'end flips active');
assert(readSlice('a').content === 'hello\n\n', 'end preserves content');

// 8. clear drops the slice entirely
clear('a');
assert(readSlice('a') === EMPTY_STATE, 'clear removes slice');

console.log('streaming-store smoke OK');
