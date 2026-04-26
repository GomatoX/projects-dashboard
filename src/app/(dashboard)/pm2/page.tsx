'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Title,
  Group,
  Text,
  Stack,
  Center,
  Loader,
  Box,
  Badge,
  Card,
  SimpleGrid,
  Button,
  ActionIcon,
  Tooltip,
  ThemeIcon,
  Progress,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconCpu,
  IconRefresh,
  IconPlayerPlay,
  IconPlayerStop,
  IconCircleCheck,
  IconCircleX,
  IconAlertTriangle,
  IconServer,
} from '@tabler/icons-react';
import type { PM2Process } from '@/lib/socket/types';

interface DeviceProcesses {
  deviceId: string;
  deviceName: string;
  processes: PM2Process[];
  error?: string;
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
  stopped: 'gray',
  errored: 'red',
  launching: 'blue',
  stopping: 'yellow',
};

export default function PM2Page() {
  const [deviceProcesses, setDeviceProcesses] = useState<DeviceProcesses[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      // Get all devices
      const devRes = await fetch('/api/devices');
      const devices = await devRes.json();

      // For each device, get PM2 list via command API
      const results: DeviceProcesses[] = await Promise.all(
        devices.map(async (device: { id: string; name: string; status: string }) => {
          if (device.status !== 'online') {
            return { deviceId: device.id, deviceName: device.name, processes: [] };
          }

          try {
            const res = await fetch(`/api/devices/${device.id}/command`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'PM2_LIST' }),
            });
            if (!res.ok) {
              return { deviceId: device.id, deviceName: device.name, processes: [] };
            }
            const data = await res.json();
            if (data.type === 'PM2_LIST_RESULT') {
              return {
                deviceId: device.id,
                deviceName: device.name,
                processes: data.processes,
              };
            }
            return {
              deviceId: device.id,
              deviceName: device.name,
              processes: [],
              error: data.message,
            };
          } catch {
            return {
              deviceId: device.id,
              deviceName: device.name,
              processes: [],
              error: 'Failed to connect',
            };
          }
        }),
      );

      setDeviceProcesses(results);
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch PM2 processes',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const allProcesses = deviceProcesses.flatMap((d) => d.processes);
  const onlineCount = allProcesses.filter((p) => p.status === 'online').length;
  const stoppedCount = allProcesses.filter((p) => p.status === 'stopped').length;
  const erroredCount = allProcesses.filter((p) => p.status === 'errored').length;

  const sendAction = async (deviceId: string, action: string, name: string) => {
    try {
      const res = await fetch(`/api/devices/${deviceId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: `PM2_${action.toUpperCase()}`, name }),
      });
      const data = await res.json();
      notifications.show({
        title: `PM2 ${action}`,
        message: data.success ? `${name} ${action}ed` : (data.message || 'Failed'),
        color: data.success ? 'teal' : 'red',
      });
      setTimeout(fetchAll, 1000);
    } catch {
      notifications.show({ title: 'Error', message: 'Command failed', color: 'red' });
    }
  };

  if (loading) {
    return (
      <Center h={400}>
        <Loader color="brand" type="dots" size="lg" />
      </Center>
    );
  }

  return (
    <>
      <Group justify="space-between" mb="xl">
        <Box>
          <Title order={2} fw={700}>
            PM2 Processes
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            {allProcesses.length} process{allProcesses.length !== 1 ? 'es' : ''} across{' '}
            {deviceProcesses.length} device{deviceProcesses.length !== 1 ? 's' : ''}
          </Text>
        </Box>
        <Group gap="sm">
          {onlineCount > 0 && (
            <Badge variant="light" color="teal" size="lg">
              {onlineCount} running
            </Badge>
          )}
          {stoppedCount > 0 && (
            <Badge variant="light" color="gray" size="lg">
              {stoppedCount} stopped
            </Badge>
          )}
          {erroredCount > 0 && (
            <Badge variant="light" color="red" size="lg">
              {erroredCount} errored
            </Badge>
          )}
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            leftSection={<IconRefresh size={14} />}
            onClick={fetchAll}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      {deviceProcesses.length === 0 ? (
        <Center h={300}>
          <Stack align="center" gap="md">
            <IconCpu size={64} style={{ opacity: 0.2 }} />
            <Text size="lg" c="dimmed">
              No devices connected
            </Text>
          </Stack>
        </Center>
      ) : (
        <Stack gap="xl">
          {deviceProcesses.map((dp) => (
            <Card key={dp.deviceId}>
              <Group gap="sm" mb="md">
                <ThemeIcon size="md" variant="light" color="brand" radius="md">
                  <IconServer size={14} />
                </ThemeIcon>
                <Text fw={600}>{dp.deviceName}</Text>
                <Badge size="sm" variant="outline" color="dark.3">
                  {dp.processes.length} process{dp.processes.length !== 1 ? 'es' : ''}
                </Badge>
              </Group>

              {dp.error ? (
                <Text size="sm" c="red">
                  {dp.error}
                </Text>
              ) : dp.processes.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No PM2 processes on this device
                </Text>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                  {dp.processes.map((proc) => (
                    <Card
                      key={proc.pm_id}
                      p="sm"
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-8)',
                        border: '1px solid var(--mantine-color-dark-6)',
                      }}
                    >
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Group gap="xs">
                            <span
                              className={`status-dot ${proc.status === 'online' ? 'status-dot--online' : 'status-dot--offline'}`}
                            />
                            <Text size="sm" fw={600} truncate>
                              {proc.name}
                            </Text>
                          </Group>
                          <Badge
                            size="xs"
                            variant="light"
                            color={statusColors[proc.status] || 'gray'}
                          >
                            {proc.status}
                          </Badge>
                        </Group>

                        <Group gap="lg">
                          <Text size="xs" c="dimmed">
                            CPU: {proc.cpu.toFixed(0)}%
                          </Text>
                          <Text size="xs" c="dimmed">
                            Mem: {formatBytes(proc.memory)}
                          </Text>
                          <Text size="xs" c="dimmed">
                            ↻ {proc.restarts}
                          </Text>
                        </Group>

                        <Text size="xs" c="dimmed">
                          Uptime: {formatUptime(proc.uptime)}
                        </Text>

                        <Group gap="xs">
                          {proc.status === 'online' ? (
                            <>
                              <Tooltip label="Restart">
                                <ActionIcon
                                  variant="light"
                                  size="sm"
                                  color="brand"
                                  onClick={() =>
                                    sendAction(dp.deviceId, 'restart', proc.name)
                                  }
                                >
                                  <IconRefresh size={12} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Stop">
                                <ActionIcon
                                  variant="light"
                                  size="sm"
                                  color="yellow"
                                  onClick={() =>
                                    sendAction(dp.deviceId, 'stop', proc.name)
                                  }
                                >
                                  <IconPlayerStop size={12} />
                                </ActionIcon>
                              </Tooltip>
                            </>
                          ) : (
                            <Tooltip label="Start">
                              <ActionIcon
                                variant="light"
                                size="sm"
                                color="teal"
                                onClick={() =>
                                  sendAction(dp.deviceId, 'start', proc.name)
                                }
                              >
                                <IconPlayerPlay size={12} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Stack>
                    </Card>
                  ))}
                </SimpleGrid>
              )}
            </Card>
          ))}
        </Stack>
      )}
    </>
  );
}
