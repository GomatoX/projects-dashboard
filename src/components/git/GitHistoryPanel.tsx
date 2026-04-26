'use client';

import {
  Card,
  Group,
  Text,
  Stack,
  Badge,
  Box,
  ActionIcon,
  Tooltip,
  ScrollArea,
  Timeline,
} from '@mantine/core';
import { IconRefresh, IconGitCommit, IconTag } from '@tabler/icons-react';
import type { GitLogEntry } from '@/lib/socket/types';

interface GitHistoryPanelProps {
  entries: GitLogEntry[];
  currentBranch: string;
  onRefresh: () => Promise<void>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);

  if (diffH < 1) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  if (diffH < 48) return 'yesterday';
  if (diffH < 168) return `${Math.round(diffH / 24)}d ago`;
  return d.toLocaleDateString();
}

export function GitHistoryPanel({ entries, currentBranch, onRefresh }: GitHistoryPanelProps) {
  return (
    <Stack gap="md">
      <Card>
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <Text size="sm" fw={600} c="dimmed" tt="uppercase">
              Commit History
            </Text>
            <Badge size="sm" variant="light" color="brand">
              {currentBranch}
            </Badge>
          </Group>
          <ActionIcon variant="subtle" size="sm" onClick={onRefresh}>
            <IconRefresh size={14} />
          </ActionIcon>
        </Group>

        {entries.length === 0 ? (
          <Text size="sm" c="dimmed">No commits found</Text>
        ) : (
          <ScrollArea h={600} type="auto">
            <Timeline active={0} bulletSize={24} lineWidth={2} color="brand">
              {entries.map((entry, i) => {
                const refs = entry.refs
                  ? entry.refs.split(',').map((r) => r.trim()).filter(Boolean)
                  : [];

                return (
                  <Timeline.Item
                    key={entry.hash}
                    bullet={<IconGitCommit size={12} />}
                    title={
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" fw={500} lineClamp={1} style={{ flex: 1 }}>
                          {entry.message}
                        </Text>
                        {refs.length > 0 && refs.map((ref) => (
                          <Badge
                            key={ref}
                            size="xs"
                            variant="light"
                            color={ref.includes('HEAD') ? 'brand' : ref.includes('origin') ? 'violet' : 'gray'}
                          >
                            {ref.replace('HEAD -> ', '').replace('origin/', '⬡ ')}
                          </Badge>
                        ))}
                      </Group>
                    }
                  >
                    <Group gap="lg">
                      <Text size="xs" c="dimmed">
                        {entry.author}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatDate(entry.date)}
                      </Text>
                      <Badge
                        size="xs"
                        variant="outline"
                        color="dark.3"
                        style={{ fontFamily: 'monospace' }}
                      >
                        {entry.hashShort}
                      </Badge>
                    </Group>
                  </Timeline.Item>
                );
              })}
            </Timeline>
          </ScrollArea>
        )}
      </Card>
    </Stack>
  );
}
