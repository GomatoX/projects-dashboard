'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Select,
  Button,
  Code,
  Group,
  Text,
  Paper,
  Loader,
  Badge,
  ThemeIcon,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconCircleCheck } from '@tabler/icons-react';
import { DEVICE_OS } from '@/lib/constants';
import type { DiscoveredProject } from '@/lib/socket/types';
import { InstallCommand } from './InstallCommand';

interface AddDeviceModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
  onProjectsDiscovered?: (deviceId: string, projects: DiscoveredProject[]) => void;
}

export function AddDeviceModal({
  opened,
  onClose,
  onCreated,
  onProjectsDiscovered,
}: AddDeviceModalProps) {
  const [step, setStep] = useState<'form' | 'token' | 'connected'>('form');
  const [loading, setLoading] = useState(false);
  const [tokenData, setTokenData] = useState<{
    rawToken: string;
    deviceId: string;
    name: string;
    os: string;
  } | null>(null);
  const [discoveredProjects, setDiscoveredProjects] = useState<DiscoveredProject[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const form = useForm({
    initialValues: {
      name: '',
      os: 'darwin',
    },
    validate: {
      name: (val) => (val.length < 1 ? 'Device name is required' : null),
    },
  });

  // Poll for device connection status
  const startPolling = useCallback(
    (deviceId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/devices/${deviceId}/status`);
          if (!res.ok) return;
          const data = await res.json();

          if (data.isConnected) {
            // Agent connected!
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setStep('connected');
            setDiscoveredProjects(data.discoveredProjects || []);

            if (data.discoveredProjects?.length > 0 && onProjectsDiscovered) {
              onProjectsDiscovered(deviceId, data.discoveredProjects);
            }
          }
        } catch {
          // Ignore polling errors
        }
      }, 2000);
    },
    [onProjectsDiscovered],
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const handleCreate = async (values: { name: string; os: string }) => {
    setLoading(true);
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setTokenData({
        rawToken: data.rawToken,
        deviceId: data.id,
        name: data.name,
        os: values.os,
      });
      setStep('token');
      onCreated();

      // Start polling for connection
      startPolling(data.id);
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setStep('form');
    setTokenData(null);
    setDiscoveredProjects([]);
    form.reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        step === 'form'
          ? 'Add Device'
          : step === 'connected'
            ? '✓ Agent Connected'
            : 'Install Agent'
      }
      size="lg"
    >
      {step === 'form' ? (
        <form onSubmit={form.onSubmit(handleCreate)}>
          <Stack gap="md">
            <TextInput
              label="Device Name"
              placeholder="e.g., home-server, macbook-pro"
              withAsterisk
              {...form.getInputProps('name')}
            />

            <Select
              label="Operating System"
              data={DEVICE_OS.map((d) => ({ value: d.value, label: d.label }))}
              {...form.getInputProps('os')}
            />

            <Button
              type="submit"
              loading={loading}
              leftSection={<IconPlus size={16} />}
              variant="gradient"
              gradient={{ from: 'brand.5', to: 'brand.7', deg: 135 }}
            >
              Generate Token
            </Button>
          </Stack>
        </form>
      ) : step === 'token' ? (
        <Stack gap="lg">
          {tokenData && (
            <InstallCommand
              rawToken={tokenData.rawToken}
              os={tokenData.os}
              deviceName={tokenData.name}
            />
          )}

          <Group gap="xs">
            <Loader size="xs" color="brand" />
            <Text size="sm" c="dimmed">
              Waiting for agent to connect...
            </Text>
          </Group>

          <Text size="xs" c="dimmed">
            💡 Re-run the same command later to <b>update</b> the agent — it
            preserves your <Code>.env</Code> and only refreshes the code. Or run{' '}
            <Code>bash ~/.dev-dashboard-agent/update.sh</Code> on the device.
          </Text>

          <Badge size="sm" variant="outline" color="yellow">
            Save this command — the dashboard does not store it. You can rotate it
            later from the device card.
          </Badge>
        </Stack>
      ) : (
        /* Connected state */
        <Stack gap="lg">
          <Group gap="sm">
            <ThemeIcon size="xl" radius="xl" color="teal" variant="light">
              <IconCircleCheck size={24} />
            </ThemeIcon>
            <div>
              <Text fw={600}>{tokenData?.name}</Text>
              <Text size="sm" c="dimmed">
                Agent connected successfully
              </Text>
            </div>
          </Group>

          {discoveredProjects.length > 0 && (
            <>
              <Text size="sm" fw={600}>
                Found {discoveredProjects.length} project
                {discoveredProjects.length !== 1 ? 's' : ''}:
              </Text>
              <Stack gap="xs">
                {discoveredProjects.map((project) => (
                  <Paper
                    key={project.path}
                    p="xs"
                    radius="sm"
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-8)',
                      border: '1px solid var(--mantine-color-dark-6)',
                    }}
                  >
                    <Group justify="space-between">
                      <div>
                        <Text size="sm" fw={500}>
                          {project.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {project.path}
                        </Text>
                      </div>
                      <Group gap={4}>
                        <Badge size="xs" variant="light" color="brand">
                          {project.detectedFramework || project.type}
                        </Badge>
                        {project.hasGit && (
                          <Badge size="xs" variant="outline" color="gray">
                            git
                          </Badge>
                        )}
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </>
          )}

          <Button onClick={handleClose} variant="light" color="brand">
            Done
          </Button>
        </Stack>
      )}
    </Modal>
  );
}
