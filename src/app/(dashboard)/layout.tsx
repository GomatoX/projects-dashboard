'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { SpotlightProvider } from '@/components/shell/SpotlightProvider';
import { Header } from '@/components/shell/Header';
import { Sidebar } from '@/components/shell/Sidebar';
import { loadSoundSettings } from '@/lib/audio';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const pathname = usePathname();
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Register service worker for PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed — non-critical
      });
    }
  }, []);

  // Warm the sound-settings cache so `playSound()` honours user prefs from
  // the very first notification (otherwise it falls back to defaults until
  // the settings page is opened).
  useEffect(() => {
    loadSoundSettings().catch(() => {});
  }, []);

  return (
    <SpotlightProvider>
      <AppShell
        header={{ height: 60 }}
        navbar={{
          width: 260,
          breakpoint: 'sm',
          collapsed: { mobile: !opened },
        }}
        padding="lg"
        styles={{
          main: {
            backgroundColor: 'var(--mantine-color-dark-9)',
            minHeight: '100vh',
          },
          header: {
            backgroundColor: 'var(--mantine-color-dark-8)',
            borderBottom: '1px solid var(--mantine-color-dark-5)',
            backdropFilter: 'blur(16px)',
          },
          navbar: {
            backgroundColor: 'var(--mantine-color-dark-8)',
            borderRight: '1px solid var(--mantine-color-dark-5)',
          },
        }}
      >
        <AppShell.Header>
          <Header opened={opened} toggle={toggle} />
        </AppShell.Header>

        <AppShell.Navbar>
          <Sidebar pathname={pathname} onNavigate={() => isMobile && toggle()} />
        </AppShell.Navbar>

        <AppShell.Main>
          <div className="animated-grid-bg" />
          <div className="animate-fade-in">{children}</div>
        </AppShell.Main>
      </AppShell>
    </SpotlightProvider>
  );
}
