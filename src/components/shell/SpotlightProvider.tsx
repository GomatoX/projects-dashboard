'use client';

import { Spotlight } from '@mantine/spotlight';
import { IconSearch } from '@tabler/icons-react';

export function SpotlightProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Spotlight
        shortcut={['mod + K']}
        actions={[]}
        nothingFound="No results found"
        searchProps={{
          leftSection: <IconSearch size={20} />,
          placeholder: 'Search projects, commands...',
        }}
        styles={{
          content: {
            backgroundColor: 'var(--mantine-color-dark-7)',
            border: '1px solid var(--mantine-color-dark-4)',
          },
          search: {
            backgroundColor: 'var(--mantine-color-dark-7)',
          },
        }}
      />
      {children}
    </>
  );
}
