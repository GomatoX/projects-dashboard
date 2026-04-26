'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Card,
  Group,
  Text,
  Badge,
  Button,
  Stack,
  Center,
  Loader,
  ThemeIcon,
  SimpleGrid,
  Progress,
  Box,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
  IconCpu,
  IconBattery3,
  IconClock,
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconLoader2,
} from '@tabler/icons-react';
import type { PM2Process } from '@/lib/socket/types';
import { PM2LogViewer } from './PM2LogViewer';
import { PM2ResourceChart } from './PM2ResourceChart';

interface PM2PanelProps {
  projectId: string;
  pm2Name: string | null;
  deviceId: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(ms: number): string {
  if (ms <= 0) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

const statusColors: Record<string, string> = {
  online: 'teal',
  stopping: 'yellow',
  stopped: 'gray',
  errored: 'red',
  launching: 'blue',
};

const statusIcons: Record<string, typeof IconCircleCheck> = {
  online: IconCircleCheck,
  stopped: IconCircleX,
  errored: IconAlertTriangle,
  launching: IconLoader2,
  stopping: IconLoader2,
};

export function PM2Panel({ projectId, pm2Name, deviceId }: PM2PanelProps) {
  const [processes, setProcesses] = useState<PM2Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/pm2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PM2_LIST' }),
      });
      if (!res.ok) return;
      const data = await res.json();

      if (data.type === 'PM2_LIST_RESULT') {
        setProcesses(data.processes);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Initial fetch + poll every 5s
  useEffect(() => {
    fetchProcesses();
    pollRef.current = setInterval(fetchProcesses, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchProcesses]);

  const sendAction = async (action: string, name: string) => {
    setActionLoading(`${action}-${name}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/pm2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: `PM2_${action.toUpperCase()}`, name }),
      });
      const data = await res.json();

      if (data.success) {
        notifications.show({
          title: `PM2 ${action}`,
          message: data.message || `${name} ${action}ed`,
          color: 'teal',
        });
      } else {
        notifications.show({
          title: 'PM2 Error',
          message: data.message || 'Action failed',
          color: 'red',
        });
      }

      // Refresh after action
      setTimeout(fetchProcesses, 1000);
    } catch {
      notifications.show({
        title: 'Error',
        message: `Failed to ${action} process`,
        color: 'red',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = (name: string) => {
    modals.openConfirmModal({
      title: 'Delete PM2 Process',
      children: (
        <Text size="sm">
          Are you sure you want to delete <b>{name}</b> from PM2? This will stop the process
          and remove it from the PM2 process list.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => sendAction('delete', name),
    });
  };

  // Get the target process (matching pm2Name) or all processes
  const targetProcess = pm2Name
    ? processes.find((p) => p.name === pm2Name)
    : null;

  if (loading) {
    return (
      <Center h={300}>
        <Loader color="brand" type="dots" size="lg" />
      </Center>
    );
  }

  if (!deviceId) {
    return (
      <Center h={200}>
        <Stack align="center" gap="sm">
          <IconAlertTriangle size={40} style={{ opacity: 0.3 }} />
          <Text c="dimmed">No device assigned to this project</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      {/* Target process (project's pm2Name) */}
      {targetProcess && (
        <ProcessDetail
          process={targetProcess}
          projectId={projectId}
          actionLoading={actionLoading}
          onRestart={() => sendAction('restart', targetProcess.name)}
          onStop={() => sendAction('stop', targetProcess.name)}
          onStart={() => sendAction('start', targetProcess.name)}
          onDelete={() => handleDelete(targetProcess.name)}
        />
      )}

      {/* All device processes table */}
      <Card>
        <Group justify="space-between" mb="md">
          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
            All PM2 Processes
          </Text>
          <Group gap="xs">
            <Badge size="sm" variant="light" color="teal">
              {processes.filter((p) => p.status === 'online').length} running
            </Badge>
            <ActionIcon variant="subtle" size="sm" onClick={fetchProcesses}>
              <IconRefresh size={14} />
            </ActionIcon>
          </Group>
        </Group>

        {processes.length > 0 ? (
          <Stack gap="xs">
            {processes.map((proc) => (
              <ProcessRow
                key={proc.pm_id}
                process={proc}
                isTarget={proc.name === pm2Name}
                actionLoading={actionLoading}
                onRestart={() => sendAction('restart', proc.name)}
                onStop={() => sendAction('stop', proc.name)}
                onStart={() => sendAction('start', proc.name)}
                onDelete={() => handleDelete(proc.name)}
              />
            ))}
          </Stack>
        ) : (
          <Center py="xl">
            <Text c="dimmed" size="sm">
              No PM2 processes found on this device
            </Text>
          </Center>
        )}
      </Card>

      {/* Log viewer */}
      {targetProcess && (
        <PM2LogViewer projectId={projectId} processName={targetProcess.name} />
      )}
    </Stack>
  );
}

// ─── Process Detail Card ──────────────────────────────────

function ProcessDetail({
  process: proc,
  projectId,
  actionLoading,
  onRestart,
  onStop,
  onStart,
  onDelete,
}: {
  process: PM2Process;
  projectId: string;
  actionLoading: string | null;
  onRestart: () => void;
  onStop: () => void;
  onStart: () => void;
  onDelete: () => void;
}) {
  const StatusIcon = statusIcons[proc.status] || IconCircleX;
  const isOnline = proc.status === 'online';

  return (
    <>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* Status Card */}
        <Card>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="sm">
                <ThemeIcon
                  size="xl"
                  radius="md"
                  variant="light"
                  color={statusColors[proc.status] || 'gray'}
                >
                  <StatusIcon size={22} />
                </ThemeIcon>
                <Box>
                  <Text fw={700} size="lg">
                    {proc.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    PID: {proc.pid || '—'} · PM2 ID: {proc.pm_id}
                  </Text>
                </Box>
              </Group>
              <Badge
                size="lg"
                variant="light"
                color={statusColors[proc.status] || 'gray'}
              >
                {proc.status}
              </Badge>
            </Group>

            {/* Quick Stats */}
            <SimpleGrid cols={2} spacing="sm">
              <Box>
                <Group gap={4} mb={2}>
                  <IconCpu size={12} style={{ opacity: 0.5 }} />
                  <Text size="xs" c="dimmed">CPU</Text>
                  <Text size="xs" fw={600} ml="auto">{proc.cpu.toFixed(1)}%</Text>
                </Group>
                <Progress
                  value={proc.cpu}
                  size="sm"
                  color={proc.cpu > 80 ? 'red' : proc.cpu > 50 ? 'yellow' : 'brand'}
                  radius="xl"
                />
              </Box>
              <Box>
                <Group gap={4} mb={2}>
                  <IconBattery3 size={12} style={{ opacity: 0.5 }} />
                  <Text size="xs" c="dimmed">Memory</Text>
                  <Text size="xs" fw={600} ml="auto">{formatBytes(proc.memory)}</Text>
                </Group>
                <Progress
                  value={Math.min((proc.memory / (512 * 1024 * 1024)) * 100, 100)}
                  size="sm"
                  color={proc.memory > 400 * 1024 * 1024 ? 'red' : 'teal'}
                  radius="xl"
                />
              </Box>
            </SimpleGrid>

            {/* Info Grid */}
            <Stack gap={4}>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Uptime</Text>
                <Text size="xs">{formatUptime(proc.uptime)}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Restarts</Text>
                <Text size="xs" c={proc.restarts > 10 ? 'red' : undefined}>
                  {proc.restarts}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Mode</Text>
                <Badge size="xs" variant="outline" color="dark.3">{proc.exec_mode}</Badge>
              </Group>
              {proc.node_version && (
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">Node</Text>
                  <Text size="xs">v{proc.node_version}</Text>
                </Group>
              )}
            </Stack>

            {/* Actions */}
            <Group gap="xs">
              {isOnline ? (
                <>
                  <Button
                    size="xs"
                    variant="light"
                    color="brand"
                    leftSection={<IconRefresh size={14} />}
                    loading={actionLoading === `restart-${proc.name}`}
                    onClick={onRestart}
                  >
                    Restart
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="yellow"
                    leftSection={<IconPlayerStop size={14} />}
                    loading={actionLoading === `stop-${proc.name}`}
                    onClick={onStop}
                  >
                    Stop
                  </Button>
                </>
              ) : (
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<IconPlayerPlay size={14} />}
                  loading={actionLoading === `start-${proc.name}`}
                  onClick={onStart}
                >
                  Start
                </Button>
              )}
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                loading={actionLoading === `delete-${proc.name}`}
                onClick={onDelete}
              >
                Delete
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Charts Card */}
        <Card>
          <PM2ResourceChart projectId={projectId} processName={proc.name} />
        </Card>
      </SimpleGrid>
    </>
  );
}

// ─── Process Row ──────────────────────────────────────────

function ProcessRow({
  process: proc,
  isTarget,
  actionLoading,
  onRestart,
  onStop,
  onStart,
  onDelete,
}: {
  process: PM2Process;
  isTarget: boolean;
  actionLoading: string | null;
  onRestart: () => void;
  onStop: () => void;
  onStart: () => void;
  onDelete: () => void;
}) {
  const isOnline = proc.status === 'online';

  return (
    <Group
      justify="space-between"
      py="xs"
      px="sm"
      style={{
        borderRadius: 'var(--mantine-radius-sm)',
        backgroundColor: isTarget
          ? 'rgba(0, 200, 200, 0.05)'
          : 'var(--mantine-color-dark-8)',
        border: isTarget ? '1px solid var(--mantine-color-brand-9)' : '1px solid transparent',
      }}
    >
      <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
        <span
          className={`status-dot ${isOnline ? 'status-dot--online' : 'status-dot--offline'}`}
        />
        <Box style={{ minWidth: 0 }}>
          <Text size="sm" fw={isTarget ? 600 : 400} truncate>
            {proc.name}
          </Text>
          <Text size="xs" c="dimmed">
            PID {proc.pid || '—'} · {formatUptime(proc.uptime)}
          </Text>
        </Box>
      </Group>

      <Group gap="xs" wrap="nowrap">
        <Badge size="xs" variant="light" color={statusColors[proc.status] || 'gray'}>
          {proc.status}
        </Badge>
        <Text size="xs" c="dimmed" w={50} ta="right">
          {proc.cpu.toFixed(0)}%
        </Text>
        <Text size="xs" c="dimmed" w={60} ta="right">
          {formatBytes(proc.memory)}
        </Text>

        {isOnline ? (
          <Tooltip label="Restart">
            <ActionIcon
              variant="subtle"
              size="sm"
              color="brand"
              loading={actionLoading === `restart-${proc.name}`}
              onClick={onRestart}
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Tooltip label="Start">
            <ActionIcon
              variant="subtle"
              size="sm"
              color="teal"
              loading={actionLoading === `start-${proc.name}`}
              onClick={onStart}
            >
              <IconPlayerPlay size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Group>
  );
}
