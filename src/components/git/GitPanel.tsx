'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Stack,
  Center,
  Loader,
  Text,
  Group,
  Tabs,
  ThemeIcon,
  Badge,
} from '@mantine/core';
import {
  IconGitBranch,
  IconGitCommit,
  IconHistory,
  IconAlertTriangle,
} from '@tabler/icons-react';
import type { GitStatus, GitBranch, GitLogEntry } from '@/lib/socket/types';
import { GitStatusPanel } from './GitStatusPanel';
import { GitHistoryPanel } from './GitHistoryPanel';
import { GitBranchPanel } from './GitBranchPanel';

interface GitPanelProps {
  projectId: string;
  projectPath: string;
  deviceId: string | null;
}

export function GitPanel({ projectId, projectPath, deviceId }: GitPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [history, setHistory] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const gitCommand = useCallback(
    async (type: string, payload: Record<string, unknown> = {}) => {
      const res = await fetch(`/api/projects/${projectId}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...payload }),
      });
      return res.json();
    },
    [projectId],
  );

  const refreshStatus = useCallback(async () => {
    const data = await gitCommand('GIT_STATUS');
    if (data.type === 'GIT_STATUS_RESULT') {
      setStatus(data.data);
    }
  }, [gitCommand]);

  const refreshBranches = useCallback(async () => {
    const data = await gitCommand('GIT_BRANCHES');
    if (data.type === 'GIT_BRANCHES_RESULT') {
      setBranches(data.branches);
    }
  }, [gitCommand]);

  const refreshHistory = useCallback(async () => {
    const data = await gitCommand('GIT_LOG', { limit: 50 });
    if (data.type === 'GIT_LOG_RESULT') {
      setHistory(data.entries);
    }
  }, [gitCommand]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([refreshStatus(), refreshBranches(), refreshHistory()]);
    setLoading(false);
  }, [refreshStatus, refreshBranches, refreshHistory]);

  useEffect(() => {
    if (deviceId) {
      refreshAll();
    } else {
      setLoading(false);
    }
  }, [deviceId, refreshAll]);

  if (!deviceId) {
    return (
      <Center h={300}>
        <Stack align="center" gap="sm">
          <IconAlertTriangle size={40} style={{ opacity: 0.3 }} />
          <Text c="dimmed">No device assigned to this project</Text>
        </Stack>
      </Center>
    );
  }

  if (loading) {
    return (
      <Center h={300}>
        <Loader color="brand" type="dots" size="lg" />
      </Center>
    );
  }

  const changedCount =
    (status?.staged.length || 0) +
    (status?.unstaged.length || 0) +
    (status?.untracked.length || 0);

  return (
    <Tabs defaultValue="changes" variant="pills" radius="md">
      <Tabs.List mb="lg">
        <Tabs.Tab
          value="changes"
          leftSection={<IconGitCommit size={16} />}
          rightSection={
            changedCount > 0 ? (
              <Badge size="xs" variant="filled" color="brand" circle>
                {changedCount}
              </Badge>
            ) : null
          }
        >
          Changes
        </Tabs.Tab>
        <Tabs.Tab
          value="history"
          leftSection={<IconHistory size={16} />}
        >
          History
        </Tabs.Tab>
        <Tabs.Tab
          value="branches"
          leftSection={<IconGitBranch size={16} />}
          rightSection={
            <Badge size="xs" variant="outline" color="dark.3">
              {branches.filter((b) => !b.name.startsWith('remotes/')).length}
            </Badge>
          }
        >
          Branches
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="changes">
        <GitStatusPanel
          status={status}
          projectId={projectId}
          gitCommand={gitCommand}
          onRefresh={refreshStatus}
        />
      </Tabs.Panel>

      <Tabs.Panel value="history">
        <GitHistoryPanel
          entries={history}
          currentBranch={status?.branch || ''}
          onRefresh={refreshHistory}
        />
      </Tabs.Panel>

      <Tabs.Panel value="branches">
        <GitBranchPanel
          branches={branches}
          currentBranch={status?.branch || ''}
          projectId={projectId}
          gitCommand={gitCommand}
          onRefresh={async () => {
            await Promise.all([refreshBranches(), refreshStatus()]);
          }}
        />
      </Tabs.Panel>
    </Tabs>
  );
}
