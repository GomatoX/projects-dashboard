'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Group,
  Text,
  Badge,
  Button,
  SegmentedControl,
  Center,
  Loader,
  ActionIcon,
  Box,
  Tooltip,
} from '@mantine/core';
import {
  IconRefresh,
  IconBrandGithub,
  IconExternalLink,
  IconUnlink,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ConnectGitHub } from './ConnectGitHub';
import { PRCard } from './PRCard';
import { PRDetailDrawer } from './PRDetailDrawer';
import type { PRListItem } from '@/lib/github';

interface GitHubPanelProps {
  projectId: string;
  github: string | null;
}

export function GitHubPanel({ projectId, github: initialGithub }: GitHubPanelProps) {
  const [github, setGithub] = useState(initialGithub);
  const [prs, setPrs] = useState<PRListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [selectedPR, setSelectedPR] = useState<number | null>(null);
  const [drawerOpened, setDrawerOpened] = useState(false);

  const fetchPRs = useCallback(async () => {
    if (!github) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/github?state=${filter}`,
      );
      const data = await res.json();
      if (data.prs) {
        setPrs(data.prs);
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch PRs',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, github, filter]);

  useEffect(() => {
    fetchPRs();
  }, [fetchPRs]);

  const disconnect = async () => {
    try {
      await fetch(`/api/projects/${projectId}/github/connect`, {
        method: 'DELETE',
      });
      setGithub(null);
      setPrs([]);
      notifications.show({
        title: 'Disconnected',
        message: 'GitHub repository unlinked',
        color: 'yellow',
      });
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to disconnect',
        color: 'red',
      });
    }
  };

  const openPR = (prNumber: number) => {
    setSelectedPR(prNumber);
    setDrawerOpened(true);
  };

  // Not connected — show connect form
  if (!github) {
    return (
      <ConnectGitHub
        projectId={projectId}
        onConnected={(repo) => setGithub(repo)}
      />
    );
  }

  const openCount = prs.filter((p) => p.state === 'open').length;
  const mergedCount = prs.filter((p) => p.state === 'merged').length;
  const closedCount = prs.filter((p) => p.state === 'closed').length;

  return (
    <>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="sm">
            <IconBrandGithub size={20} style={{ opacity: 0.6 }} />
            <Text size="sm" fw={600}>
              {github}
            </Text>
            <Tooltip label="Open on GitHub">
              <ActionIcon
                variant="subtle"
                size="sm"
                component="a"
                href={`https://github.com/${github}`}
                target="_blank"
              >
                <IconExternalLink size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>

          <Group gap="xs">
            <Tooltip label="Refresh PRs">
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={fetchPRs}
                loading={loading}
              >
                <IconRefresh size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Disconnect">
              <ActionIcon
                variant="subtle"
                size="sm"
                color="red"
                onClick={disconnect}
              >
                <IconUnlink size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Filter + stats */}
        <Group justify="space-between">
          <SegmentedControl
            size="xs"
            value={filter}
            onChange={setFilter}
            data={[
              { label: `All (${prs.length})`, value: 'all' },
              { label: `Open (${openCount})`, value: 'open' },
              { label: `Merged (${mergedCount})`, value: 'merged' },
              { label: `Closed (${closedCount})`, value: 'closed' },
            ]}
          />
        </Group>

        {/* PR List */}
        {loading ? (
          <Center h={200}>
            <Loader color="brand" type="dots" />
          </Center>
        ) : prs.length === 0 ? (
          <Center h={200}>
            <Stack align="center" gap="sm">
              <IconBrandGithub size={40} style={{ opacity: 0.15 }} />
              <Text size="sm" c="dimmed">
                No pull requests found
              </Text>
              <Button
                size="xs"
                variant="light"
                color="brand"
                leftSection={<IconRefresh size={14} />}
                onClick={fetchPRs}
              >
                Refresh
              </Button>
            </Stack>
          </Center>
        ) : (
          <Stack gap={6}>
            {prs
              .filter((pr) => filter === 'all' || pr.state === filter)
              .map((pr) => (
                <PRCard key={pr.number} pr={pr} onClick={() => openPR(pr.number)} />
              ))}
          </Stack>
        )}
      </Stack>

      {/* Detail Drawer */}
      <PRDetailDrawer
        projectId={projectId}
        prNumber={selectedPR}
        opened={drawerOpened}
        onClose={() => setDrawerOpened(false)}
      />
    </>
  );
}
