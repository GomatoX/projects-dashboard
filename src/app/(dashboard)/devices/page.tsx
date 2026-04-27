'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Title,
  Group,
  Button,
  SimpleGrid,
  Text,
  Stack,
  Center,
  Loader,
  Box,
  Badge,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notify } from '@/lib/notify';
import { IconPlus, IconDeviceDesktop, IconRefresh, IconBook } from '@tabler/icons-react';
import { DeviceCard } from '@/components/devices/DeviceCard';
import { AddDeviceModal } from '@/components/devices/AddDeviceModal';
import type { SystemStats, DiscoveredProject } from '@/lib/socket/types';

interface Device {
  id: string;
  name: string;
  os: string;
  status: string;
  localIp: string;
  lastSeen: string | null;
  capabilities: string;
}

interface DeviceWithStats extends Device {
  systemStats?: SystemStats | null;
  isConnected?: boolean;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false);
  const refreshRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices');
      const data: Device[] = await res.json();

      // Enrich with real-time status for each device
      const enriched: DeviceWithStats[] = await Promise.all(
        data.map(async (device) => {
          try {
            const statusRes = await fetch(`/api/devices/${device.id}/status`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              return {
                ...device,
                status: statusData.isConnected ? 'online' : device.status,
                systemStats: statusData.connectedInfo?.systemStats || null,
                isConnected: statusData.isConnected,
              };
            }
          } catch {
            // Ignore status fetch errors
          }
          return { ...device, systemStats: null };
        }),
      );

      setDevices(enriched);
    } catch {
      notify({
        title: 'Error',
        message: 'Failed to fetch devices',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    fetchDevices();

    refreshRef.current = setInterval(fetchDevices, 30_000);

    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [fetchDevices]);

  const onlineCount = devices.filter((d) => d.status === 'online' || d.isConnected).length;

  const handleDelete = (id: string) => {
    const device = devices.find((d) => d.id === id);
    modals.openConfirmModal({
      title: 'Remove device',
      children: (
        <Text size="sm">
          Are you sure you want to remove <b>{device?.name}</b>? The agent will need to
          be reinstalled.
        </Text>
      ),
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await fetch(`/api/devices/${id}`, { method: 'DELETE' });
          notify({
            title: 'Removed',
            message: `${device?.name} has been removed`,
            color: 'orange',
          });
          fetchDevices();
        } catch {
          notify({
            title: 'Error',
            message: 'Failed to remove device',
            color: 'red',
          });
        }
      },
    });
  };

  const handleProjectsDiscovered = (deviceId: string, projects: DiscoveredProject[]) => {
    notify({
      title: 'Projects Discovered',
      message: `Found ${projects.length} project${projects.length !== 1 ? 's' : ''} on the connected device`,
      color: 'teal',
    });
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
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <Box>
          <Group gap="sm">
            <Title order={2} fw={700}>
              Devices
            </Title>
            {onlineCount > 0 && (
              <Badge
                size="md"
                variant="light"
                color="green"
                leftSection={
                  <span
                    className="status-dot status-dot--online"
                    style={{ width: 6, height: 6 }}
                  />
                }
              >
                {onlineCount} online
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed" mt={4}>
            {devices.length} device{devices.length !== 1 ? 's' : ''} configured
          </Text>
        </Box>
        <Group gap="sm">
          <Button
            component={Link}
            href="/guides/device-setup"
            variant="subtle"
            color="gray"
            size="sm"
            leftSection={<IconBook size={14} />}
          >
            Setup Guide
          </Button>
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            leftSection={<IconRefresh size={14} />}
            onClick={fetchDevices}
          >
            Refresh
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            variant="gradient"
            gradient={{ from: 'brand.5', to: 'brand.7', deg: 135 }}
            onClick={openAdd}
          >
            Add Device
          </Button>
        </Group>
      </Group>

      {/* Grid */}
      {devices.length > 0 ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              {...device}
              systemStats={device.systemStats}
              onDelete={handleDelete}
            />
          ))}
        </SimpleGrid>
      ) : (
        <Center h={300}>
          <Stack align="center" gap="md">
            <IconDeviceDesktop size={64} style={{ opacity: 0.2 }} />
            <Text size="lg" c="dimmed" ta="center">
              No devices connected yet
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              Add a device to start managing your projects remotely. The agent runs on
              your server or Mac and communicates over your local network.
            </Text>
            <Button
              variant="light"
              color="brand"
              onClick={openAdd}
              leftSection={<IconPlus size={16} />}
            >
              Add your first device
            </Button>
          </Stack>
        </Center>
      )}

      <AddDeviceModal
        opened={addOpened}
        onClose={closeAdd}
        onCreated={fetchDevices}
        onProjectsDiscovered={handleProjectsDiscovered}
      />
    </>
  );
}
