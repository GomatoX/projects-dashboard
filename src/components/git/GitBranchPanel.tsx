'use client';

import { useState } from 'react';
import {
  Card,
  Group,
  Text,
  Stack,
  Badge,
  Button,
  TextInput,
  ActionIcon,
  Tooltip,
  Box,
  UnstyledButton,
  ScrollArea,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notify } from '@/lib/notify';
import {
  IconRefresh,
  IconGitBranch,
  IconPlus,
  IconTrash,
  IconCheck,
  IconCloud,
  IconArrowRight,
} from '@tabler/icons-react';
import type { GitBranch } from '@/lib/socket/types';

interface GitBranchPanelProps {
  branches: GitBranch[];
  currentBranch: string;
  projectId: string;
  gitCommand: (type: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onRefresh: () => Promise<void>;
}

export function GitBranchPanel({
  branches,
  currentBranch,
  projectId,
  gitCommand,
  onRefresh,
}: GitBranchPanelProps) {
  const [newBranchName, setNewBranchName] = useState('');
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const localBranches = branches.filter((b) => !b.name.startsWith('remotes/'));
  const remoteBranches = branches.filter((b) => b.name.startsWith('remotes/'));

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    setCreating(true);
    try {
      const result = await gitCommand('GIT_CREATE_BRANCH', {
        name: newBranchName.trim(),
        from: currentBranch,
      }) as { success?: boolean; message?: string };

      if (result.success) {
        notify({ title: 'Branch created', message: result.message as string, color: 'teal' });
        setNewBranchName('');
        await onRefresh();
      } else {
        notify({ title: 'Error', message: (result.message as string) || 'Failed', color: 'red' });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCheckout = async (branch: string) => {
    if (branch === currentBranch) return;
    setSwitching(branch);
    try {
      const result = await gitCommand('GIT_CHECKOUT', { branch }) as { success?: boolean; message?: string };

      if (result.success) {
        notify({ title: 'Switched', message: result.message as string, color: 'teal', autoClose: 1500 });
        await onRefresh();
      } else {
        notify({ title: 'Error', message: (result.message as string) || 'Checkout failed', color: 'red' });
      }
    } finally {
      setSwitching(null);
    }
  };

  const handleDeleteBranch = (name: string) => {
    modals.openConfirmModal({
      title: 'Delete Branch',
      children: (
        <Text size="sm">
          Delete local branch <b>{name}</b>? This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const result = await gitCommand('GIT_DELETE_BRANCH', { name, remote: false }) as { success?: boolean; message?: string };
        if (result.success) {
          notify({ title: 'Deleted', message: `Branch ${name} deleted`, color: 'teal' });
          await onRefresh();
        } else {
          notify({ title: 'Error', message: (result.message as string) || 'Delete failed', color: 'red' });
        }
      },
    });
  };

  const handleFetch = async () => {
    const result = await gitCommand('GIT_FETCH') as { success?: boolean; message?: string };
    notify({
      title: result.success ? 'Fetched' : 'Fetch Failed',
      message: result.message as string,
      color: result.success ? 'teal' : 'red',
      autoClose: 2000,
    });
    if (result.success) await onRefresh();
  };

  return (
    <Stack gap="lg">
      {/* Create Branch */}
      <Card>
        <Text size="sm" fw={600} c="dimmed" tt="uppercase" mb="sm">
          Create Branch
        </Text>
        <Group gap="sm">
          <TextInput
            size="xs"
            placeholder="feature/my-branch"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.currentTarget.value)}
            style={{ flex: 1 }}
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-dark-7)',
                border: '1px solid var(--mantine-color-dark-5)',
                fontFamily: 'monospace',
                fontSize: 12,
              },
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateBranch();
            }}
          />
          <Button
            size="xs"
            color="brand"
            leftSection={<IconPlus size={14} />}
            loading={creating}
            disabled={!newBranchName.trim()}
            onClick={handleCreateBranch}
          >
            Create from {currentBranch}
          </Button>
        </Group>
      </Card>

      {/* Local Branches */}
      <Card>
        <Group justify="space-between" mb="sm">
          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
            Local Branches
          </Text>
          <Badge size="sm" variant="light" color="brand">
            {localBranches.length}
          </Badge>
        </Group>

        <Stack gap={2}>
          {localBranches.map((branch) => (
            <Group
              key={branch.name}
              justify="space-between"
              py={4}
              px={8}
              style={{
                borderRadius: 'var(--mantine-radius-xs)',
                backgroundColor: branch.current
                  ? 'rgba(0, 200, 200, 0.06)'
                  : 'transparent',
                border: branch.current
                  ? '1px solid var(--mantine-color-brand-9)'
                  : '1px solid transparent',
              }}
            >
              <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                <IconGitBranch
                  size={14}
                  color={branch.current ? 'var(--mantine-color-brand-5)' : '#666'}
                />
                <Text
                  size="sm"
                  fw={branch.current ? 600 : 400}
                  c={branch.current ? 'brand.4' : undefined}
                  truncate
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                >
                  {branch.name}
                </Text>
                {branch.current && (
                  <Badge size="xs" variant="light" color="brand">
                    current
                  </Badge>
                )}
              </Group>

              <Group gap={4} wrap="nowrap">
                <Badge
                  size="xs"
                  variant="outline"
                  color="dark.3"
                  style={{ fontFamily: 'monospace' }}
                >
                  {branch.commit?.slice(0, 7)}
                </Badge>

                {!branch.current && (
                  <>
                    <Tooltip label="Switch to branch">
                      <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="brand"
                        loading={switching === branch.name}
                        onClick={() => handleCheckout(branch.name)}
                      >
                        <IconArrowRight size={12} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete">
                      <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="red"
                        onClick={() => handleDeleteBranch(branch.name)}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Tooltip>
                  </>
                )}
              </Group>
            </Group>
          ))}
        </Stack>
      </Card>

      {/* Remote Branches */}
      <Card>
        <Group justify="space-between" mb="sm">
          <Group gap="xs">
            <Text size="sm" fw={600} c="dimmed" tt="uppercase">
              Remote Branches
            </Text>
            <IconCloud size={14} style={{ opacity: 0.4 }} />
          </Group>
          <Group gap="xs">
            <Badge size="sm" variant="outline" color="dark.3">
              {remoteBranches.length}
            </Badge>
            <Button size="compact-xs" variant="subtle" color="brand" onClick={handleFetch}>
              Fetch
            </Button>
          </Group>
        </Group>

        <ScrollArea mah={200}>
          <Stack gap={2}>
            {remoteBranches.map((branch) => (
              <Group key={branch.name} gap="xs" py={2} px={8}>
                <IconCloud size={12} style={{ opacity: 0.3 }} />
                <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }} truncate>
                  {branch.name.replace('remotes/', '')}
                </Text>
                <Badge
                  size="xs"
                  variant="outline"
                  color="dark.4"
                  ml="auto"
                  style={{ fontFamily: 'monospace' }}
                >
                  {branch.commit?.slice(0, 7)}
                </Badge>
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      </Card>
    </Stack>
  );
}
