// agent/src/mcp/browser/__smoke__/context-pool.smoke.ts
//
// Run: cd agent && node --import tsx src/mcp/browser/__smoke__/context-pool.smoke.ts
//
// Verifies LRU eviction at cap=5 and basic open/close. Idle TTL eviction
// is hard to test in 10 min, so we only verify the public API — the
// timer-based sweep is left as a manual check.

import {
  getOrCreateContext,
  closeContext,
  closeAll,
  listChatIds,
  setAgentSocket,
} from '../context-pool.js';

// Fake socket so we don't crash on emit().
setAgentSocket({
  emit() {},
} as unknown as Parameters<typeof setAgentSocket>[0]);

async function main() {
  console.log('Smoke: open 6 contexts, expect oldest evicted');
  for (let i = 1; i <= 6; i++) {
    await getOrCreateContext(`chat-${i}`, `session-${i}`);
    // Stagger lastUsed so chat-1 is the LRU victim.
    await new Promise((r) => setTimeout(r, 5));
    console.log(`  open chat-${i}: pool size=${listChatIds().length}`);
  }

  const remaining = listChatIds();
  if (remaining.length !== 5) {
    console.error('FAIL: expected 5 contexts, got', remaining.length);
    process.exit(1);
  }
  if (remaining.includes('chat-1')) {
    console.error('FAIL: chat-1 should have been evicted (LRU)');
    process.exit(1);
  }
  console.log('OK: pool capped at 5, chat-1 evicted');

  console.log('Smoke: explicit close');
  await closeContext('chat-3', 'explicit');
  if (listChatIds().includes('chat-3')) {
    console.error('FAIL: chat-3 still present after closeContext');
    process.exit(1);
  }
  console.log('OK: chat-3 removed');

  await closeAll();
  if (listChatIds().length !== 0) {
    console.error('FAIL: closeAll did not drain pool');
    process.exit(1);
  }
  console.log('OK: pool drained');

  console.log('\nALL SMOKE CHECKS PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
