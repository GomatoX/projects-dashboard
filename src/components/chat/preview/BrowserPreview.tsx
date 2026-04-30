'use client';
import { useEffect, useState } from 'react';
import { IconLock, IconWorld } from '@tabler/icons-react';
import {
  type BrowserFrame,
  getLatestFrame,
  pushFrame,
  subscribe,
} from '@/lib/ai/browser-frame-store';

interface Props {
  chatId: string;
  /**
   * When set, on mount (and on chatId change) the preview will fetch a
   * one-shot screenshot from the agent if the local frame store is empty.
   * Repopulates the panel after a page refresh — the live screencast only
   * fires frames when the page renders something new, so a static page
   * would otherwise stay blank until the next interaction.
   *
   * Omit this prop in contexts that DON'T own the snapshot fetch (e.g. the
   * popout window, which receives frames via the BroadcastChannel from the
   * main window). Firing twice would just be a wasted round-trip but is
   * otherwise harmless — the agent's captureSnapshot() doesn't `touch()`
   * the context so it has no side effect on idle TTL.
   */
  projectId?: string;
}

export function BrowserPreview({ chatId, projectId }: Props) {
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

  // Fetch a one-shot snapshot when we mount with no frame already cached.
  // We deliberately read getLatestFrame() at fire-time rather than gating
  // on the `frame` state: a previous render may have already kicked off
  // the request and a fresh BROWSER_FRAME may have just landed.
  useEffect(() => {
    if (!projectId) return;
    if (getLatestFrame(chatId)) return;

    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/chat/${chatId}/browser/snapshot`,
          { method: 'POST', signal: ac.signal },
        );
        if (!res.ok) return; // 503/504/etc. — leave the "waiting…" state alone.
        const body = (await res.json()) as
          | { ok: true; frame: BrowserFrame }
          | { ok: false; reason: string; error?: string };
        if (body.ok && body.frame) {
          // Push through the store so any other subscriber (e.g. the
          // popout view bridged over BroadcastChannel) sees the frame too.
          pushFrame(chatId, body.frame);
        }
      } catch {
        // AbortError on unmount, network error, etc. — silently ignore;
        // the next live BROWSER_FRAME (if any) will repopulate.
      }
    })();
    return () => ac.abort();
  }, [chatId, projectId]);

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
