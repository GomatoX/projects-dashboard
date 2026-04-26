'use client';

import { useState } from 'react';
import {
  Card,
  Stack,
  TextInput,
  Button,
  Text,
  Group,
  ThemeIcon,
  Badge,
  Box,
} from '@mantine/core';
import {
  IconBrandGithub,
  IconLink,
  IconCheck,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface ConnectGitHubProps {
  projectId: string;
  onConnected: (repo: string) => void;
}

export function ConnectGitHub({ projectId, onConnected }: ConnectGitHubProps) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const connect = async () => {
    if (!value.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/github/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github: value }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Connection failed');
        return;
      }

      notifications.show({
        title: 'Connected',
        message: `Linked to ${data.repo}`,
        color: 'teal',
      });
      onConnected(data.repo);
    } catch {
      setError('Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      maw={480}
      mx="auto"
      mt="xl"
      style={{
        border: '1px dashed var(--mantine-color-dark-4)',
        backgroundColor: 'var(--mantine-color-dark-8)',
      }}
    >
      <Stack align="center" gap="lg" py="xl">
        <ThemeIcon
          size={64}
          radius="xl"
          variant="light"
          color="gray"
          style={{ border: '1px solid var(--mantine-color-dark-5)' }}
        >
          <IconBrandGithub size={32} />
        </ThemeIcon>

        <Box ta="center">
          <Text size="lg" fw={600}>
            Connect GitHub Repository
          </Text>
          <Text size="sm" c="dimmed" mt={4}>
            Link a repository to view PRs and generate AI reviews
          </Text>
        </Box>

        <TextInput
          w="100%"
          placeholder="owner/repo or https://github.com/owner/repo"
          leftSection={<IconLink size={16} />}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && connect()}
          error={error}
        />

        {error && (
          <Group gap="xs">
            <IconAlertTriangle size={14} color="var(--mantine-color-red-5)" />
            <Text size="xs" c="red">
              {error}
            </Text>
          </Group>
        )}

        <Button
          leftSection={<IconCheck size={16} />}
          color="brand"
          loading={loading}
          onClick={connect}
          disabled={!value.trim()}
          fullWidth
        >
          Connect Repository
        </Button>

        <Text size="xs" c="dimmed" ta="center">
          Requires <code>GITHUB_TOKEN</code> in your <code>.env.local</code>
        </Text>
      </Stack>
    </Card>
  );
}
