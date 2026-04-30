// src/app/popout/layout.tsx
//
// Layout for windows opened via window.open() (currently: browser-preview
// popout). Inherits MantineProvider / ModalsProvider from the root layout.
// Deliberately full-bleed: no sidebar, no header, no project tabs — these
// windows are meant for second-monitor focus.

import type { ReactNode } from 'react';
import type { Metadata } from 'next';

// Title shown in the OS taskbar / window switcher — distinguishes the popped-
// out window from the main dashboard tab on a second monitor.
export const metadata: Metadata = {
  title: 'Browser Preview — Dev Dashboard',
};

export default function PopoutLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--mantine-color-dark-9)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}
