// agent/src/mcp/browser/screencast.ts
import type { BrowserContext, Page } from 'playwright';
import type { Socket } from 'socket.io-client';
import type { AgentEvent } from '../../../../src/lib/socket/types.js';

const MAX_WIDTH = 800;
const JPEG_QUALITY = 60;
const EVERY_NTH_FRAME = 6;

/**
 * Attach a CDP screencast to the page and pipe JPEGs to the agent socket
 * as BROWSER_FRAME events keyed by chatId.
 *
 * Returns a teardown fn that stops the screencast and closes the CDP session.
 */
export async function attachScreencast(args: {
  ctx: BrowserContext;
  page: Page;
  chatId: string;
  sessionId: string;
  socket: Socket;
}): Promise<() => Promise<void>> {
  const { ctx, page, chatId, sessionId, socket } = args;

  const session = await ctx.newCDPSession(page);
  await session.send('Page.startScreencast', {
    format: 'jpeg',
    quality: JPEG_QUALITY,
    maxWidth: MAX_WIDTH,
    everyNthFrame: EVERY_NTH_FRAME,
  });

  const handler = async (params: {
    sessionId: number;
    data: string;
    metadata: { timestamp?: number; deviceWidth?: number; deviceHeight?: number };
  }) => {
    const evt: AgentEvent = {
      type: 'BROWSER_FRAME',
      chatId,
      sessionId,
      frameB64: params.data,
      timestamp: Date.now(),
      width: params.metadata.deviceWidth ?? MAX_WIDTH,
      height: params.metadata.deviceHeight ?? Math.round((MAX_WIDTH * 3) / 4),
      url: page.url(),
    };
    socket.emit('event', evt);
    // CDP requires per-frame ack to keep the stream flowing.
    try {
      await session.send('Page.screencastFrameAck', { sessionId: params.sessionId });
    } catch {
      // Page may have been torn down; the frame loop will end naturally.
    }
  };

  // CDPSession is an EventEmitter at runtime even though the .d.ts is fussy.
  (session as unknown as { on(ev: string, fn: (p: unknown) => void): void }).on(
    'Page.screencastFrame',
    handler as unknown as (p: unknown) => void,
  );

  return async () => {
    try {
      await session.send('Page.stopScreencast');
    } catch {
      // best-effort
    }
    try {
      await session.detach();
    } catch {
      // best-effort
    }
  };
}
