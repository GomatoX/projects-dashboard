'use client';

import {
  Card,
  Group,
  Text,
  Badge,
  Stack,
  ThemeIcon,
  ActionIcon,
  Tooltip,
  Box,
} from '@mantine/core';
import { IconTrash, IconExternalLink, IconGitBranch } from '@tabler/icons-react';
import { PROJECT_TYPE_ICONS } from '@/lib/constants';
import Link from 'next/link';
import classes from './ProjectCard.module.css';

interface ProjectCardProps {
  id: string;
  name: string;
  type: string;
  path: string;
  tags: string;
  deviceName?: string | null;
  deviceStatus?: string | null;
  deviceOs?: string | null;
  onDelete: (id: string) => void;
}

export function ProjectCard({
  id,
  name,
  type,
  path,
  tags,
  deviceName,
  deviceStatus,
  onDelete,
}: ProjectCardProps) {
  const Icon = PROJECT_TYPE_ICONS[type] || PROJECT_TYPE_ICONS.other;
  const parsedTags: string[] = (() => {
    try {
      return JSON.parse(tags);
    } catch {
      return [];
    }
  })();

  return (
    <Card className={classes.card} component={Link} href={`/projects/${id}`}>
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ overflow: 'hidden' }}>
            <ThemeIcon
              size="lg"
              radius="md"
              variant="light"
              color="brand"
              className={classes.icon}
            >
              <Icon size={20} />
            </ThemeIcon>
            <Box style={{ overflow: 'hidden' }}>
              <Text fw={600} size="md" truncate="end">
                {name}
              </Text>
              <Text size="xs" c="dimmed" truncate="end">
                {path}
              </Text>
            </Box>
          </Group>

          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(id);
            }}
            className={classes.deleteBtn}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>

        {/* Status row */}
        <Group gap="xs">
          <Badge size="sm" variant="outline" color="brand">
            {type}
          </Badge>

          {deviceName && (
            <Badge
              size="sm"
              variant="dot"
              color={deviceStatus === 'online' ? 'teal' : 'gray'}
            >
              {deviceName}
            </Badge>
          )}
        </Group>

        {/* Tags */}
        {parsedTags.length > 0 && (
          <Group gap={4}>
            {parsedTags.map((tag) => (
              <Badge key={tag} size="xs" variant="filled" color="dark.5">
                {tag}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>
    </Card>
  );
}
