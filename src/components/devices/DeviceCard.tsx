'use client';

import { useState } from 'react';
import {
  Card,
  Group,
  Text,
  Badge,
  Stack,
  ThemeIcon,
  ActionIcon,
  Box,
  Progress,
  Collapse,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import {
  IconTrash,
  IconServer,
  IconDeviceDesktop,
  IconDeviceLaptop,
  IconClock,
  IconCpu,
  IconBattery3,
  IconChevronDown,
  IconChevronUp,
  IconRefresh,
  IconLoader2,
  IconKey,
} from '@tabler/icons-react';
import type { SystemStats } from '@/lib/socket/types';
import { notify } from '@/lib/notify';
import { ReinstallCommandModal } from './ReinstallCommandModal';
import classes from './DeviceCard.module.css';

interface DeviceCardProps {
  id: string;
  name: string;
  os: string;
  status: string;
  localIp: string;
  lastSeen: string | null;
  capabilities: string;
  systemStats?: SystemStats | null;
  onDelete: (id: string) => void;
}

const osIcons: Record<string, typeof IconServer> = {
  linux: IconServer,
  darwin: IconDeviceLaptop,
  windows: IconDeviceDesktop,
};

const osLabels: Record<string, string> = {
  linux: 'Linux',
  darwin: 'macOS',
  windows: 'Windows',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function DeviceCard({
  id,
  name,
  os,
  status,
  localIp,
  lastSeen,
  capabilities,
  systemStats,
  onDelete,
}: DeviceCardProps) {
  const [expanded, { toggle }] = useDisclosure(false);
  // Tracks the in-flight POST /api/devices/:id/update so the button can
  // show a spinner. We deliberately don't track post-restart progress
  // here — the agent reconnects with a new banner version, which the
  // device list polls and surfaces via lastSeen / status changes.
  const [updating, setUpdating] = useState(false);
  // Controls the "Show install command" modal (rotates token + displays the
  // curl one-liner). Opens unconditionally regardless of online state — the
  // primary use case is "I lost the command and need to reinstall".
  const [reinstallOpen, setReinstallOpen] = useState(false);
  const OsIcon = osIcons[os] || IconServer;
  const parsedCapabilities: string[] = (() => {
    try {
      return JSON.parse(capabilities);
    } catch {
      return [];
    }
  })();

  const isOnline = status === 'online';

  const handleUpdate = () => {
    modals.openConfirmModal({
      title: 'Update agent',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Trigger a remote self-update on <b>{name}</b>?
          </Text>
          <Text size="xs" c="dimmed">
            The device will download the latest agent tarball, swap files in{' '}
            <code>~/.dev-dashboard-agent</code>, and restart via its service manager. The
            device will briefly show as offline while restarting (typically 5–10 seconds).
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Update', cancel: 'Cancel' },
      confirmProps: { color: 'blue', leftSection: <IconRefresh size={14} /> },
      onConfirm: async () => {
        setUpdating(true);
        try {
          const res = await fetch(`/api/devices/${id}/update`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || `HTTP ${res.status}`);
          }
          notify({
            color: 'teal',
            title: 'Update started',
            message: data.fromVersion
              ? `Updating ${name} (v${data.fromVersion} → latest). Reconnects shortly.`
              : `Updating ${name}. Reconnects shortly.`,
          });
        } catch (err) {
          notify({
            color: 'red',
            title: 'Update failed',
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          setUpdating(false);
        }
      },
    });
  };

  const formatLastSeen = (ts: string | null) => {
    if (!ts) return 'Never';
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Card className={classes.card}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon
              size="xl"
              radius="md"
              variant="light"
              color={isOnline ? 'green' : 'gray'}
              className={classes.icon}
            >
              <OsIcon size={22} />
            </ThemeIcon>
            <Box>
              <Group gap={8}>
                <Text fw={600} size="md">
                  {name}
                </Text>
                <Tooltip label={isOnline ? 'Connected' : 'Offline'} withArrow>
                  <span
                    className={`status-dot status-dot--lg ${
                      isOnline ? 'status-dot--online' : 'status-dot--offline'
                    }`}
                    aria-label={isOnline ? 'Connected' : 'Offline'}
                  />
                </Tooltip>
              </Group>
              <Text size="xs" c="dimmed">
                {osLabels[os] || os} {localIp && `• ${localIp}`}
              </Text>
            </Box>
          </Group>

          <Group gap={4}>
            {isOnline && systemStats && (
              <Tooltip label={expanded ? 'Hide stats' : 'Show stats'}>
                <ActionIcon variant="subtle" size="sm" onClick={toggle}>
                  {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip
              label={isOnline ? 'Update agent' : 'Device offline — cannot update'}
            >
              {/*
                Wrapping span so the Tooltip still works when the button
                is disabled (Mantine forwards `disabled` to the underlying
                button, which strips pointer events otherwise).
              */}
              <span>
                <ActionIcon
                  variant="subtle"
                  color="blue"
                  size="sm"
                  onClick={handleUpdate}
                  disabled={!isOnline || updating}
                  loading={updating}
                  aria-label={`Update ${name}`}
                >
                  {updating ? <IconLoader2 size={14} /> : <IconRefresh size={14} />}
                </ActionIcon>
              </span>
            </Tooltip>
            <Tooltip label="Show install command">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => setReinstallOpen(true)}
                aria-label={`Show install command for ${name}`}
              >
                <IconKey size={14} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={() => onDelete(id)}
              className={classes.deleteBtn}
              aria-label={`Delete ${name}`}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Quick stats bar (when online + stats available) */}
        {isOnline && systemStats && (
          <Group gap="md" grow>
            <Tooltip label={`CPU: ${systemStats.cpu.usage.toFixed(1)}%`}>
              <Box>
                <Group gap={4} mb={2}>
                  <IconCpu size={12} style={{ opacity: 0.5 }} />
                  <Text size="xs" c="dimmed">
                    CPU
                  </Text>
                  <Text size="xs" fw={600} ml="auto">
                    {systemStats.cpu.usage.toFixed(0)}%
                  </Text>
                </Group>
                <Progress
                  value={systemStats.cpu.usage}
                  size="xs"
                  color={systemStats.cpu.usage > 80 ? 'red' : systemStats.cpu.usage > 50 ? 'yellow' : 'brand'}
                  radius="xl"
                />
              </Box>
            </Tooltip>
            <Tooltip
              label={`Memory: ${formatBytes(systemStats.memory.used)} / ${formatBytes(systemStats.memory.total)}`}
            >
              <Box>
                <Group gap={4} mb={2}>
                  <IconBattery3 size={12} style={{ opacity: 0.5 }} />
                  <Text size="xs" c="dimmed">
                    RAM
                  </Text>
                  <Text size="xs" fw={600} ml="auto">
                    {systemStats.memory.usagePercent.toFixed(0)}%
                  </Text>
                </Group>
                <Progress
                  value={systemStats.memory.usagePercent}
                  size="xs"
                  color={
                    systemStats.memory.usagePercent > 80
                      ? 'red'
                      : systemStats.memory.usagePercent > 60
                        ? 'yellow'
                        : 'green'
                  }
                  radius="xl"
                />
              </Box>
            </Tooltip>
          </Group>
        )}

        <Group gap="xs">
          <Badge
            size="sm"
            variant={isOnline ? 'light' : 'outline'}
            color={isOnline ? 'green' : 'gray'}
            leftSection={
              <span
                className={`status-dot ${
                  isOnline ? 'status-dot--online' : 'status-dot--offline'
                }`}
                style={{ width: 6, height: 6 }}
              />
            }
          >
            {isOnline ? 'Connected' : 'Offline'}
          </Badge>

          {lastSeen && (
            <Badge size="sm" variant="outline" color="gray" leftSection={<IconClock size={10} />}>
              {formatLastSeen(lastSeen)}
            </Badge>
          )}
        </Group>

        {/* Expanded system stats */}
        <Collapse expanded={expanded}>
          {systemStats && (
            <Stack gap="xs" mt="xs">
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  CPU
                </Text>
                <Text size="xs">{systemStats.cpu.model}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  Cores
                </Text>
                <Text size="xs">{systemStats.cpu.cores}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  Memory
                </Text>
                <Text size="xs">
                  {formatBytes(systemStats.memory.used)} / {formatBytes(systemStats.memory.total)}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  Disk
                </Text>
                <Text size="xs">
                  {formatBytes(systemStats.disk.used)} / {formatBytes(systemStats.disk.total)} (
                  {systemStats.disk.usagePercent.toFixed(0)}%)
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  Uptime
                </Text>
                <Text size="xs">
                  {Math.floor(systemStats.uptime / 3600)}h{' '}
                  {Math.floor((systemStats.uptime % 3600) / 60)}m
                </Text>
              </Group>
            </Stack>
          )}
        </Collapse>

        {parsedCapabilities.length > 0 && (
          <Group gap={4}>
            {parsedCapabilities.map((cap) => (
              <Badge key={cap} size="xs" variant="filled" color="gray">
                {cap}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>

      <ReinstallCommandModal
        opened={reinstallOpen}
        onClose={() => setReinstallOpen(false)}
        deviceId={id}
        deviceName={name}
        os={os}
        isConnected={isOnline}
      />
    </Card>
  );
}
