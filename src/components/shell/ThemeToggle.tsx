'use client';

import { Menu, useMantineColorScheme, type MantineColorScheme } from '@mantine/core';
import {
  IconCheck,
  IconDeviceDesktop,
  IconMoon,
  IconSun,
} from '@tabler/icons-react';

const OPTIONS: Array<{
  value: MantineColorScheme;
  label: string;
  icon: typeof IconSun;
}> = [
  { value: 'light', label: 'Light', icon: IconSun },
  { value: 'dark', label: 'Dark', icon: IconMoon },
  { value: 'auto', label: 'System', icon: IconDeviceDesktop },
];

/**
 * Renders the theme picker as a set of <Menu.Item> entries so it can be
 * dropped straight into the Header avatar dropdown alongside Settings /
 * Sign out. Uses Mantine's built-in localStorage persistence
 * (`mantine-color-scheme-value` key).
 */
export function ThemeToggleMenuItems() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <>
      <Menu.Label>Appearance</Menu.Label>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <Menu.Item
          key={value}
          leftSection={<Icon size={14} />}
          rightSection={
            colorScheme === value ? <IconCheck size={14} /> : null
          }
          onClick={() => setColorScheme(value)}
          closeMenuOnClick={false}
        >
          {label}
        </Menu.Item>
      ))}
    </>
  );
}
