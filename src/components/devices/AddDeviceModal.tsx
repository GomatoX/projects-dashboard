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
  CopyButton,
  ActionIcon,
  Tooltip,
  Paper,
  Loader,
  Badge,
  ThemeIcon,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  IconPlus,
  IconCopy,
  IconCheck,
  IconTerminal2,
  IconCircleCheck,
} from '@tabler/icons-react';
import { DEVICE_OS } from '@/lib/constants';
import type { DiscoveredProject } from '@/lib/socket/types';

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

  const dashboardUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const installScript =
    tokenData?.os === 'darwin'
      ? `curl -fsSL ${dashboardUrl}/install/mac | bash -s -- \\
  ${dashboardUrl} \\
  ${tokenData?.rawToken}`
      : `curl -fsSL ${dashboardUrl}/install/linux | bash -s -- \\
  ${dashboardUrl} \\
  ${tokenData?.rawToken}`;

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
          <Text size="sm" c="dimmed">
            Run this command on <b>{tokenData?.name}</b> to install the agent:
          </Text>

          <Paper
            p="md"
            radius="md"
            style={{
              backgroundColor: 'var(--mantine-color-dark-9)',
              border: '1px solid var(--mantine-color-dark-5)',
              position: 'relative',
            }}
          >
            <Group justify="space-between" align="flex-start">
              <Group gap="xs" mb="xs">
                <IconTerminal2 size={14} style={{ opacity: 0.5 }} />
                <Text size="xs" c="dimmed">
                  Terminal
                </Text>
              </Group>
              <CopyButton value={installScript}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copied!' : 'Copy command'}>
                    <ActionIcon
                      variant="subtle"
                      color={copied ? 'teal' : 'gray'}
                      onClick={copy}
                      size="sm"
                    >
                      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            <Code
              block
              style={{
                backgroundColor: 'transparent',
                fontSize: '13px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {installScript}
            </Code>
          </Paper>

          <Text size="xs" c="dimmed">
            Or run the agent manually for testing:
          </Text>
          <Paper
            p="sm"
            radius="md"
            style={{
              backgroundColor: 'var(--mantine-color-dark-9)',
              border: '1px solid var(--mantine-color-dark-5)',
            }}
          >
            <Code
              block
              style={{ backgroundColor: 'transparent', fontSize: '12px' }}
            >{`cd agent && cp .env.example .env
# Edit .env with your token
DASHBOARD_URL=${dashboardUrl}
AGENT_TOKEN=${tokenData?.rawToken}

pnpm install && pnpm dev`}</Code>
          </Paper>

          <Group gap="xs">
            <Loader size="xs" color="brand" />
            <Text size="sm" c="dimmed">
              Waiting for agent to connect...
            </Text>
          </Group>

          <Badge size="sm" variant="outline" color="yellow">
            Token expires in 10 minutes
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
                          <Badge size="xs" variant="outline" color="dark.3">
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
