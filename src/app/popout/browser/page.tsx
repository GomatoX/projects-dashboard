// src/app/popout/browser/page.tsx
//
// Popped-out browser-preview window. URL: /popout/browser?chatId=XYZ
// Auth is enforced by src/middleware.ts (the path is NOT in the matcher
// exclusion list).

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Center, Text } from '@mantine/core';
import { BrowserPopoutView } from '@/components/chat/preview/BrowserPopoutView';

// Pure client page: we need useSearchParams which is a client-only hook.
// In Next 16 the equivalent server-component pattern (`searchParams: Promise<…>`)
// would also work, but we'd lose the simpler hook ergonomics — and this view
// is client-only anyway because of BroadcastChannel.
//
// Next 16 requires an explicit <Suspense> boundary around any component that
// calls useSearchParams() to opt out of static prerender (CSR bailout).
function PopoutBrowserInner() {
  const sp = useSearchParams();
  const chatId = sp.get('chatId');

  if (!chatId) {
    return (
      <Center h="100%">
        <Text c="dimmed" size="sm">
          Missing chatId — open this window from the dashboard browser preview.
        </Text>
      </Center>
    );
  }

  return <BrowserPopoutView chatId={chatId} />;
}

export default function PopoutBrowserPage() {
  return (
    <Suspense fallback={null}>
      <PopoutBrowserInner />
    </Suspense>
  );
}
