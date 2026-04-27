'use client';

import {
  Title,
  Text,
  Card,
  Stack,
  PasswordInput,
  Button,
  Group,
  Badge,
  SimpleGrid,
  Box,
} from '@mantine/core';
import {
  IconKey,
  IconInfoCircle,
  IconDeviceFloppy,
} from '@tabler/icons-react';
import { SoundSettings } from '@/components/settings/SoundSettings';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';

export default function SettingsPage() {
  return (
    <>
      <Group mb="xl">
        <Box>
          <Title order={2} fw={700}>
            Settings
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Dashboard configuration
          </Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* AI Configuration */}
        <Card>
          <Stack gap="md">
            <Group gap="sm">
              <IconKey size={20} style={{ opacity: 0.6 }} />
              <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                AI Configuration
              </Text>
            </Group>

            <Card
              p="sm"
              style={{
                backgroundColor: 'var(--mantine-color-dark-7)',
                border: '1px solid var(--mantine-color-dark-5)',
              }}
            >
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={500}>
                  Claude Agent SDK
                </Text>
                <Badge size="xs" variant="light" color="teal">
                  CLI Auth
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                The AI chat uses the Claude Agent SDK which authenticates via
                your local Claude Code CLI. Run{' '}
                <code>claude login</code> in your terminal if not authenticated.
              </Text>
            </Card>

            <PasswordInput
              label="GitHub Token"
              placeholder="ghp_..."
              description="Required for PR integration"
            />

            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              variant="light"
              color="brand"
              disabled
            >
              Save Keys
            </Button>

            <Text size="xs" c="dimmed">
              Keys are encrypted before storage. They never leave your server.
            </Text>
          </Stack>
        </Card>

        {/* Appearance */}
        <AppearanceSettings />

        {/* Sound Settings */}
        <SoundSettings />

        {/* About */}
        <Card>
          <Stack gap="md">
            <Group gap="sm">
              <IconInfoCircle size={20} style={{ opacity: 0.6 }} />
              <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                About
              </Text>
            </Group>

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Version
              </Text>
              <Badge variant="light" color="brand">
                v1.0.0 — Release
              </Badge>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Framework
              </Text>
              <Text size="sm">Next.js 16.2</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                UI Library
              </Text>
              <Text size="sm">Mantine 9.1</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Database
              </Text>
              <Text size="sm">SQLite (Drizzle ORM)</Text>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>
    </>
  );
}
