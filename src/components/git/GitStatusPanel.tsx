'use client';

import { useState } from 'react';
import {
  Card,
  Group,
  Text,
  Stack,
  Badge,
  Button,
  Textarea,
  ActionIcon,
  Tooltip,
  Box,
  UnstyledButton,
  Checkbox,
  Divider,
  ThemeIcon,
} from '@mantine/core';
import { notify } from '@/lib/notify';
import {
  IconRefresh,
  IconGitCommit,
  IconUpload,
  IconDownload,
  IconPlus,
  IconMinus,
  IconEdit,
  IconTrash,
  IconQuestionMark,
  IconCheck,
  IconArrowUp,
  IconArrowDown,
} from '@tabler/icons-react';
import type { GitStatus, GitFileChange } from '@/lib/socket/types';

interface GitStatusPanelProps {
  status: GitStatus | null;
  projectId: string;
  gitCommand: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onRefresh: () => Promise<void>;
}

const statusIcons: Record<string, typeof IconEdit> = {
  M: IconEdit,
  A: IconPlus,
  D: IconTrash,
  '?': IconQuestionMark,
  R: IconEdit,
};

const statusColors: Record<string, string> = {
  M: '#ffd43b',
  A: '#69db7c',
  D: '#ff6b6b',
  '?': '#868e96',
  R: '#74c0fc',
};

export function GitStatusPanel({
  status,
  projectId,
  gitCommand,
  onRefresh,
}: GitStatusPanelProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  if (!status) return null;

  const handleStageFiles = async (files: string[]) => {
    const result = await gitCommand('GIT_STAGE', { files }) as { success?: boolean; message?: string };
    if (result.success) {
      notify({ title: 'Staged', message: `${files.length} file(s)`, color: 'teal', autoClose: 1500 });
      await onRefresh();
    }
  };

  const handleUnstageFiles = async (files: string[]) => {
    const result = await gitCommand('GIT_UNSTAGE', { files }) as { success?: boolean };
    if (result.success) {
      notify({ title: 'Unstaged', message: `${files.length} file(s)`, color: 'yellow', autoClose: 1500 });
      await onRefresh();
    }
  };

  const handleStageAll = async () => {
    const allFiles = [
      ...status.unstaged.map((f) => f.path),
      ...status.untracked,
    ];
    if (allFiles.length > 0) {
      await handleStageFiles(allFiles);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    try {
      const result = await gitCommand('GIT_COMMIT', {
        message: commitMessage.trim(),
        amend: false,
      }) as { success?: boolean; message?: string };

      if (result.success) {
        notify({ title: 'Committed', message: result.message as string, color: 'teal' });
        setCommitMessage('');
        await onRefresh();
      } else {
        notify({ title: 'Error', message: (result.message as string) || 'Commit failed', color: 'red' });
      }
    } finally {
      setCommitting(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    try {
      const result = await gitCommand('GIT_PUSH', { force: false }) as { success?: boolean; message?: string };
      notify({
        title: result.success ? 'Pushed' : 'Push Failed',
        message: result.message as string,
        color: result.success ? 'teal' : 'red',
      });
      if (result.success) await onRefresh();
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    try {
      const result = await gitCommand('GIT_PULL') as { success?: boolean; message?: string };
      notify({
        title: result.success ? 'Pulled' : 'Pull Failed',
        message: result.message as string,
        color: result.success ? 'teal' : 'red',
      });
      if (result.success) await onRefresh();
    } finally {
      setPulling(false);
    }
  };

  return (
    <Stack gap="lg">
      {/* Branch + Sync Info */}
      <Card>
        <Group justify="space-between">
          <Group gap="sm">
            <Badge size="lg" variant="light" color="brand">
              {status.branch}
            </Badge>
            {status.ahead > 0 && (
              <Badge size="sm" variant="outline" color="teal" leftSection={<IconArrowUp size={10} />}>
                {status.ahead} ahead
              </Badge>
            )}
            {status.behind > 0 && (
              <Badge size="sm" variant="outline" color="yellow" leftSection={<IconArrowDown size={10} />}>
                {status.behind} behind
              </Badge>
            )}
            {status.isClean && (
              <Badge size="sm" variant="light" color="teal" leftSection={<IconCheck size={10} />}>
                Clean
              </Badge>
            )}
          </Group>

          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              color="teal"
              leftSection={<IconUpload size={14} />}
              loading={pushing}
              onClick={handlePush}
              disabled={status.ahead === 0 && status.isClean}
            >
              Push
            </Button>
            <Button
              size="xs"
              variant="light"
              color="brand"
              leftSection={<IconDownload size={14} />}
              loading={pulling}
              onClick={handlePull}
            >
              Pull
            </Button>
            <ActionIcon variant="subtle" size="sm" onClick={onRefresh}>
              <IconRefresh size={14} />
            </ActionIcon>
          </Group>
        </Group>
      </Card>

      {/* Staged Changes */}
      <Card>
        <Group justify="space-between" mb="sm">
          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
            Staged Changes
          </Text>
          <Badge size="sm" variant="light" color="teal">
            {status.staged.length}
          </Badge>
        </Group>

        {status.staged.length === 0 ? (
          <Text size="xs" c="dimmed">No staged changes</Text>
        ) : (
          <Stack gap={2}>
            {status.staged.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                statusChar={file.index}
                onAction={() => handleUnstageFiles([file.path])}
                actionLabel="Unstage"
                actionIcon={<IconMinus size={12} />}
              />
            ))}
          </Stack>
        )}
      </Card>

      {/* Unstaged + Untracked */}
      <Card>
        <Group justify="space-between" mb="sm">
          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
            Changes
          </Text>
          <Group gap="xs">
            <Badge size="sm" variant="light" color="yellow">
              {status.unstaged.length + status.untracked.length}
            </Badge>
            {(status.unstaged.length + status.untracked.length) > 0 && (
              <Button size="compact-xs" variant="light" color="teal" onClick={handleStageAll}>
                Stage All
              </Button>
            )}
          </Group>
        </Group>

        {status.unstaged.length === 0 && status.untracked.length === 0 ? (
          <Text size="xs" c="dimmed">No changes</Text>
        ) : (
          <Stack gap={2}>
            {status.unstaged.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                statusChar={file.working_dir}
                onAction={() => handleStageFiles([file.path])}
                actionLabel="Stage"
                actionIcon={<IconPlus size={12} />}
              />
            ))}
            {status.untracked.map((path) => (
              <FileRow
                key={path}
                file={{ path, index: '?', working_dir: '?' }}
                statusChar="?"
                onAction={() => handleStageFiles([path])}
                actionLabel="Stage"
                actionIcon={<IconPlus size={12} />}
              />
            ))}
          </Stack>
        )}
      </Card>

      {/* Commit Box */}
      <Card>
        <Text size="sm" fw={600} c="dimmed" tt="uppercase" mb="sm">
          Commit
        </Text>
        <Textarea
          placeholder="Commit message..."
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.currentTarget.value)}
          minRows={2}
          maxRows={5}
          autosize
          mb="sm"
          styles={{
            input: {
              backgroundColor: 'var(--mantine-color-dark-7)',
              border: '1px solid var(--mantine-color-dark-5)',
              fontFamily: 'monospace',
              fontSize: 13,
            },
          }}
        />
        <Button
          fullWidth
          color="brand"
          leftSection={<IconGitCommit size={16} />}
          disabled={!commitMessage.trim() || status.staged.length === 0}
          loading={committing}
          onClick={handleCommit}
        >
          Commit {status.staged.length > 0 ? `(${status.staged.length} files)` : ''}
        </Button>
      </Card>
    </Stack>
  );
}

// ─── File Row ─────────────────────────────────────────────

function FileRow({
  file,
  statusChar,
  onAction,
  actionLabel,
  actionIcon,
}: {
  file: GitFileChange;
  statusChar: string;
  onAction: () => void;
  actionLabel: string;
  actionIcon: React.ReactNode;
}) {
  const Icon = statusIcons[statusChar] || IconEdit;
  const color = statusColors[statusChar] || '#888';

  return (
    <Group
      justify="space-between"
      py={3}
      px={8}
      style={{
        borderRadius: 'var(--mantine-radius-xs)',
        transition: 'background-color 0.1s',
      }}
    >
      <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
        <ThemeIcon size="xs" variant="transparent" color={color}>
          <Icon size={12} />
        </ThemeIcon>
        <Text size="xs" truncate style={{ flex: 1 }}>
          {file.path}
        </Text>
        <Badge size="xs" variant="light" color={color} w={20} style={{ textAlign: 'center' }}>
          {statusChar}
        </Badge>
      </Group>
      <Tooltip label={actionLabel}>
        <ActionIcon variant="subtle" size="xs" onClick={onAction}>
          {actionIcon}
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
