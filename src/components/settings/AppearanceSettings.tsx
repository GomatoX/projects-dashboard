'use client';

import {
  Card,
  Group,
  SegmentedControl,
  Stack,
  Text,
  useMantineColorScheme,
  type MantineColorScheme,
} from '@mantine/core';
import {
  IconDeviceDesktop,
  IconMoon,
  IconPalette,
  IconSun,
} from '@tabler/icons-react';

export function AppearanceSettings() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <Card>
      <Stack gap="md">
        <Group gap="sm">
          <IconPalette size={20} style={{ opacity: 0.6 }} />
          <Text size="sm" fw={600} tt="uppercase" c="dimmed">
            Appearance
          </Text>
        </Group>

        <Stack gap={6}>
          <Text size="sm" fw={500}>
            Color scheme
          </Text>
          <Text size="xs" c="dimmed">
            Choose Light, Dark, or follow your operating system.
          </Text>
        </Stack>

        <SegmentedControl
          value={colorScheme}
          onChange={(value) => setColorScheme(value as MantineColorScheme)}
          fullWidth
          data={[
            {
              value: 'light',
              label: (
                <Group gap={6} justify="center" wrap="nowrap">
                  <IconSun size={14} />
                  <span>Light</span>
                </Group>
              ),
            },
            {
              value: 'dark',
              label: (
                <Group gap={6} justify="center" wrap="nowrap">
                  <IconMoon size={14} />
                  <span>Dark</span>
                </Group>
              ),
            },
            {
              value: 'auto',
              label: (
                <Group gap={6} justify="center" wrap="nowrap">
                  <IconDeviceDesktop size={14} />
                  <span>System</span>
                </Group>
              ),
            },
          ]}
        />

        <Text size="xs" c="dimmed">
          Your choice is saved to this browser.
        </Text>
      </Stack>
    </Card>
  );
}
