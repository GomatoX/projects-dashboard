'use client';

import { useState } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Badge,
  Button,
  ThemeIcon,
  Code,
  Collapse,
  Box,
  ActionIcon,
} from '@mantine/core';
import {
  IconTool,
  IconCheck,
  IconX,
  IconChevronDown,
  IconChevronUp,
  IconFileText,
  IconFolder,
  IconPencil,
  IconFileDiff,
  IconFiles,
  IconSearch,
  IconFileSearch,
  IconTerminal,
  IconRobot,
} from '@tabler/icons-react';

// ─── Types ──────────────────────────────────────────────

export interface PermissionRequest {
  toolUseId: string;
  toolName: string;
  displayName: string;
  category: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
  status: 'pending' | 'approved' | 'denied' | 'auto';
  result?: string;
}

export interface ToolActivity {
  id: string;
  toolName: string;
  displayName: string;
  status: 'auto' | 'completed';
}

interface ToolApprovalCardProps {
  permission: PermissionRequest;
  onApprove: (toolUseId: string) => void;
  onDeny: (toolUseId: string) => void;
  loading?: boolean;
}

// ─── Icon / color mapping for Agent SDK tools ───────────

const TOOL_ICONS: Record<string, typeof IconTool> = {
  Read: IconFileText,
  LS: IconFolder,
  Write: IconPencil,
  Edit: IconFileDiff,
  MultiEdit: IconFiles,
  Glob: IconSearch,
  Grep: IconFileSearch,
  Bash: IconTerminal,
  Task: IconRobot,
};

const TOOL_COLORS: Record<string, string> = {
  Read: 'cyan',
  LS: 'cyan',
  Write: 'yellow',
  Edit: 'yellow',
  MultiEdit: 'yellow',
  Glob: 'teal',
  Grep: 'teal',
  Bash: 'red',
  Task: 'grape',
};

function formatInput(permission: PermissionRequest): string {
  const input = permission.input;
  // Bash tool
  if (permission.toolName === 'Bash' && input.command) {
    return String(input.command);
  }
  // File tools
  if (input.file_path || input.path) {
    return String(input.file_path || input.path);
  }
  // Edit tool
  if (input.file_path && input.old_string) {
    return `${input.file_path}`;
  }
  // Task tool
  if (input.prompt) {
    const prompt = String(input.prompt);
    return prompt.length > 80 ? prompt.slice(0, 80) + '...' : prompt;
  }
  // Fallback
  return permission.title || permission.displayName;
}

// ─── Component ──────────────────────────────────────────

export function ToolApprovalCard({
  permission,
  onApprove,
  onDeny,
  loading,
}: ToolApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[permission.toolName] || IconTool;
  const color = TOOL_COLORS[permission.toolName] || 'gray';

  const statusBadge = () => {
    switch (permission.status) {
      case 'pending':
        return (
          <Badge size="xs" variant="light" color="yellow">
            Needs Approval
          </Badge>
        );
      case 'approved':
        return (
          <Badge size="xs" variant="filled" color="teal">
            Allowed
          </Badge>
        );
      case 'denied':
        return (
          <Badge size="xs" variant="filled" color="red">
            Denied
          </Badge>
        );
      case 'auto':
        return (
          <Badge size="xs" variant="light" color="dark.4">
            Auto
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card
      py="xs"
      px="sm"
      my={4}
      style={{
        border: `1px solid ${
          permission.status === 'pending'
            ? 'var(--mantine-color-yellow-8)'
            : permission.status === 'denied'
              ? 'var(--mantine-color-red-9)'
              : 'var(--mantine-color-dark-5)'
        }`,
        backgroundColor:
          permission.status === 'pending'
            ? 'rgba(255, 200, 0, 0.03)'
            : 'var(--mantine-color-dark-7)',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={24} variant="light" color={color} radius="sm">
            <Icon size={12} />
          </ThemeIcon>
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Group gap="xs">
              <Text size="xs" fw={600} c={`${color}.4`}>
                {permission.displayName}
              </Text>
              {statusBadge()}
            </Group>
            <Text size="xs" c="dimmed" lineClamp={1} style={{ fontFamily: 'monospace' }}>
              {formatInput(permission)}
            </Text>
            {permission.description && (
              <Text size="xs" c="dimmed" mt={2}>
                {permission.description}
              </Text>
            )}
          </Box>
        </Group>

        <Group gap={4}>
          {permission.status === 'pending' && (
            <>
              <Button
                size="compact-xs"
                color="teal"
                variant="light"
                leftSection={<IconCheck size={10} />}
                onClick={() => onApprove(permission.toolUseId)}
                loading={loading}
              >
                Allow
              </Button>
              <Button
                size="compact-xs"
                color="red"
                variant="subtle"
                leftSection={<IconX size={10} />}
                onClick={() => onDeny(permission.toolUseId)}
              >
                Deny
              </Button>
            </>
          )}
          {permission.result && (
            <ActionIcon
              variant="subtle"
              size="xs"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
            </ActionIcon>
          )}
        </Group>
      </Group>

      {permission.result && (
        <Collapse expanded={expanded}>
          <Box mt="xs">
            <Code
              block
              style={{
                fontSize: 11,
                maxHeight: 200,
                overflowY: 'auto',
                backgroundColor: 'var(--mantine-color-dark-8)',
              }}
            >
              {permission.result}
            </Code>
          </Box>
        </Collapse>
      )}
    </Card>
  );
}

// ─── Compact tool activity badge (auto-allowed tools) ───

interface ToolActivityBadgeProps {
  activity: ToolActivity;
}

export function ToolActivityBadge({ activity }: ToolActivityBadgeProps) {
  const Icon = TOOL_ICONS[activity.toolName] || IconTool;
  const color = TOOL_COLORS[activity.toolName] || 'gray';

  return (
    <Badge
      size="xs"
      variant="light"
      color={color}
      leftSection={<Icon size={10} />}
      style={{ fontFamily: 'monospace', opacity: 0.6 }}
    >
      {activity.displayName}
    </Badge>
  );
}
