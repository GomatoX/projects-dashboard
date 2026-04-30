'use client';
import { useEffect, useState } from 'react';
import { IconLock, IconWorld } from '@tabler/icons-react';
import {
  type BrowserFrame,
  getLatestFrame,
  subscribe,
} from '@/lib/ai/browser-frame-store';

interface Props {
  chatId: string;
}

export function BrowserPreview({ chatId }: Props) {
  // Initialise with whatever frame is already in the store for this chat.
  // When chatId changes React remounts (the parent keys on item.id) so the
  // initialiser always fires with the correct chatId.
  const [frame, setFrame] = useState<BrowserFrame | undefined>(() =>
    getLatestFrame(chatId),
  );

  useEffect(() => {
    // Subscribe to live frames pushed after mount.
    return subscribe(chatId, (f) => setFrame(f));
  }, [chatId]);

  if (!frame) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Waiting for the browser to render its first frame…
      </div>
    );
  }

  const isHttps = frame.url.startsWith('https://');

  // The frames are JPEGs sized up to 800w; we use h-full/w-full so the
  // browser snapshot SCALES UP to fill the panel (max-* would only cap it).
  // object-fit: contain preserves aspect ratio with letterboxing on the
  // shorter dimension.
  return (
    <div className="flex h-full flex-col bg-black/95">
      {/* Browser-style URL bar: padded toolbar, rounded "address input" with
          a leading lock/globe icon and monospace url text. */}
      <div
        className="flex items-center gap-2 border-b px-2 py-1.5"
        style={{
          background: 'var(--mantine-color-dark-7, #1a1b1e)',
          borderColor: 'var(--mantine-color-dark-5, #2c2e33)',
        }}
      >
        <div
          className="flex flex-1 items-center gap-2 rounded-md px-2.5 py-1 min-w-0"
          style={{
            background: 'var(--mantine-color-dark-8, #141517)',
            border: '1px solid var(--mantine-color-dark-5, #2c2e33)',
          }}
          title={frame.url}
        >
          {isHttps ? (
            <IconLock size={12} style={{ color: '#10b981', flexShrink: 0 }} />
          ) : (
            <IconWorld size={12} style={{ color: '#9aa0a6', flexShrink: 0 }} />
          )}
          <span
            className="truncate text-xs"
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              color: 'var(--mantine-color-gray-3, #cbd5e1)',
            }}
          >
            {frame.url}
          </span>
        </div>
      </div>

      {/* Snapshot pane — fills all remaining space, lets the image scale up. */}
      <div className="flex-1 overflow-hidden bg-black/95 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${frame.frameB64}`}
          alt="Browser viewport"
          className="h-full w-full object-contain"
          style={{ imageRendering: 'auto' }}
        />
      </div>
    </div>
  );
}
