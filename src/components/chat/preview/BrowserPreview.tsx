'use client';
import { useEffect, useState } from 'react';
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

  // The frames are JPEGs sized up to 800w; we let CSS scale them to the
  // panel. object-fit: contain keeps the aspect ratio.
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-1 text-xs text-muted-foreground truncate">
        {frame.url}
      </div>
      <div className="flex-1 overflow-hidden bg-black/95 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${frame.frameB64}`}
          alt="Browser viewport"
          className="max-h-full max-w-full object-contain"
          style={{ imageRendering: 'auto' }}
        />
      </div>
    </div>
  );
}
