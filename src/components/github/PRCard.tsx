'use client';

import {
  Card,
  Group,
  Text,
  Badge,
  Avatar,
  Box,
  UnstyledButton,
} from '@mantine/core';
import {
  IconGitPullRequest,
  IconGitMerge,
  IconX,
  IconMessageCircle,
  IconPlus,
  IconMinus,
} from '@tabler/icons-react';
import type { PRListItem } from '@/lib/github';

interface PRCardProps {
  pr: PRListItem;
  onClick: () => void;
}

const STATE_CONFIG = {
  open: { color: 'teal', icon: IconGitPullRequest, label: 'Open' },
  merged: { color: 'violet', icon: IconGitMerge, label: 'Merged' },
  closed: { color: 'red', icon: IconX, label: 'Closed' },
} as const;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function PRCard({ pr, onClick }: PRCardProps) {
  const stateConfig = STATE_CONFIG[pr.state as keyof typeof STATE_CONFIG] || STATE_CONFIG.open;
  const StateIcon = stateConfig.icon;

  return (
    <UnstyledButton onClick={onClick} w="100%">
      <Card
        py="sm"
        px="md"
        style={{
          border: '1px solid var(--mantine-color-dark-5)',
          backgroundColor: 'var(--mantine-color-dark-7)',
          transition: 'border-color 0.15s, background-color 0.15s',
          cursor: 'pointer',
        }}
        className="pr-card-hover"
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <StateIcon
              size={18}
              color={`var(--mantine-color-${stateConfig.color}-5)`}
              style={{ flexShrink: 0 }}
            />

            <Box style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" fw={600} lineClamp={1}>
                  {pr.title}
                </Text>
                {pr.isDraft && (
                  <Badge size="xs" variant="outline" color="gray">
                    Draft
                  </Badge>
                )}
              </Group>

              <Group gap="xs" mt={2}>
                <Text size="xs" c="dimmed">
                  #{pr.number}
                </Text>
                <Text size="xs" c="dimmed">
                  ·
                </Text>
                <Text size="xs" c="dimmed">
                  {pr.branch}
                </Text>
                {pr.labels.length > 0 && (
                  <>
                    <Text size="xs" c="dimmed">
                      ·
                    </Text>
                    {pr.labels.slice(0, 3).map((l) => (
                      <Badge
                        key={l.name}
                        size="xs"
                        variant="filled"
                        style={{
                          backgroundColor: `#${l.color}`,
                          color:
                            parseInt(l.color, 16) > 0x808080
                              ? '#000'
                              : '#fff',
                        }}
                      >
                        {l.name}
                      </Badge>
                    ))}
                  </>
                )}
              </Group>
            </Box>
          </Group>

          <Group gap="md" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Group gap={4}>
              <IconPlus size={12} color="var(--mantine-color-teal-5)" />
              <Text size="xs" c="teal.5" fw={500}>
                {pr.additions}
              </Text>
              <IconMinus size={12} color="var(--mantine-color-red-5)" />
              <Text size="xs" c="red.5" fw={500}>
                {pr.deletions}
              </Text>
            </Group>

            {pr.commentsCount > 0 && (
              <Group gap={3}>
                <IconMessageCircle size={12} style={{ opacity: 0.5 }} />
                <Text size="xs" c="dimmed">
                  {pr.commentsCount}
                </Text>
              </Group>
            )}

            <Avatar src={pr.authorAvatar} size={22} radius="xl" />

            <Text size="xs" c="dimmed" style={{ minWidth: 50, textAlign: 'right' }}>
              {timeAgo(pr.updatedAt)}
            </Text>
          </Group>
        </Group>
      </Card>
    </UnstyledButton>
  );
}
