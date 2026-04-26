'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Stack,
  Group,
  Text,
  TextInput,
  Button,
  ActionIcon,
  Paper,
  ScrollArea,
  UnstyledButton,
  Loader,
  Center,
  Tooltip,
  Modal,
  Breadcrumbs,
  Anchor,
  ThemeIcon,
  Badge,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconFolder,
  IconFolderOpen,
  IconChevronRight,
  IconArrowUp,
  IconCheck,
  IconHome,
  IconFolderPlus,
} from '@tabler/icons-react';

interface FolderPickerProps {
  value: string;
  onChange: (path: string) => void;
  deviceId: string;
  label?: string;
  placeholder?: string;
}

interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export function FolderPicker({
  value,
  onChange,
  deviceId,
  label = 'Path',
  placeholder = '/home/user/projects/my-project',
}: FolderPickerProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [currentPath, setCurrentPath] = useState('');
  const [directories, setDirectories] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectories = useCallback(
    async (path: string) => {
      if (!deviceId) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/devices/${deviceId}/browse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to browse');
        }

        const data = await res.json();
        setCurrentPath(data.path);
        setDirectories(data.directories || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to browse');
        setDirectories([]);
      } finally {
        setLoading(false);
      }
    },
    [deviceId],
  );

  // Initial load when modal opens
  useEffect(() => {
    if (opened) {
      const startPath = value || process.env.HOME || '/';
      fetchDirectories(startPath);
    }
  }, [opened, fetchDirectories, value]);

  const navigateTo = (path: string) => {
    fetchDirectories(path);
  };

  const goUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigateTo(parent);
  };

  const goHome = () => {
    navigateTo('~');
  };

  const selectCurrentPath = () => {
    onChange(currentPath);
    close();
  };

  const selectFolder = (path: string) => {
    onChange(path);
    close();
  };

  // Parse breadcrumb segments
  const pathSegments = currentPath.split('/').filter(Boolean);

  return (
    <>
      <TextInput
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        withAsterisk
        rightSection={
          deviceId ? (
            <Tooltip label="Browse folders">
              <ActionIcon
                variant="subtle"
                color="brand"
                onClick={open}
                size="sm"
              >
                <IconFolderOpen size={16} />
              </ActionIcon>
            </Tooltip>
          ) : null
        }
        rightSectionPointerEvents="all"
      />

      <Modal
        opened={opened}
        onClose={close}
        title={
          <Group gap="sm">
            <IconFolderPlus size={20} style={{ opacity: 0.6 }} />
            <Text fw={600}>Select Project Folder</Text>
          </Group>
        }
        size="lg"
      >
        <Stack gap="md">
          {/* Toolbar */}
          <Group gap="xs">
            <Tooltip label="Go up">
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={goUp}
                disabled={currentPath === '/'}
              >
                <IconArrowUp size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Home">
              <ActionIcon variant="subtle" color="gray" onClick={goHome}>
                <IconHome size={16} />
              </ActionIcon>
            </Tooltip>
            <Paper
              px="sm"
              py={4}
              style={{
                flex: 1,
                backgroundColor: 'var(--mantine-color-dark-8)',
                border: '1px solid var(--mantine-color-dark-5)',
                borderRadius: 'var(--mantine-radius-sm)',
                overflow: 'hidden',
              }}
            >
              <Breadcrumbs
                separator={<IconChevronRight size={10} style={{ opacity: 0.3 }} />}
                styles={{ separator: { margin: '0 2px' } }}
              >
                <Anchor
                  size="xs"
                  onClick={() => navigateTo('/')}
                  c="dimmed"
                  style={{ cursor: 'pointer' }}
                >
                  /
                </Anchor>
                {pathSegments.map((segment, i) => (
                  <Anchor
                    key={i}
                    size="xs"
                    onClick={() =>
                      navigateTo('/' + pathSegments.slice(0, i + 1).join('/'))
                    }
                    c={i === pathSegments.length - 1 ? 'brand' : 'dimmed'}
                    fw={i === pathSegments.length - 1 ? 600 : 400}
                    style={{ cursor: 'pointer' }}
                  >
                    {segment}
                  </Anchor>
                ))}
              </Breadcrumbs>
            </Paper>
          </Group>

          {/* Directory listing */}
          <Paper
            style={{
              border: '1px solid var(--mantine-color-dark-5)',
              backgroundColor: 'var(--mantine-color-dark-8)',
              borderRadius: 'var(--mantine-radius-md)',
              overflow: 'hidden',
            }}
          >
            <ScrollArea h={300}>
              {loading ? (
                <Center h={300}>
                  <Loader color="brand" type="dots" size="sm" />
                </Center>
              ) : error ? (
                <Center h={300}>
                  <Text size="sm" c="red.4">
                    {error}
                  </Text>
                </Center>
              ) : directories.length === 0 ? (
                <Center h={300}>
                  <Text size="sm" c="dimmed">
                    No subdirectories
                  </Text>
                </Center>
              ) : (
                <Stack gap={0}>
                  {directories.map((dir) => (
                    <UnstyledButton
                      key={dir.path}
                      w="100%"
                      py={6}
                      px="sm"
                      style={{
                        borderBottom: '1px solid var(--mantine-color-dark-6)',
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          'var(--mantine-color-dark-6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '';
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Group
                          gap="xs"
                          wrap="nowrap"
                          style={{ flex: 1, cursor: 'pointer' }}
                          onClick={() => navigateTo(dir.path)}
                        >
                          <ThemeIcon
                            variant="subtle"
                            color="brand"
                            size="sm"
                          >
                            <IconFolder size={14} />
                          </ThemeIcon>
                          <Text size="sm" lineClamp={1}>
                            {dir.name}
                          </Text>
                        </Group>
                        <Tooltip label="Select this folder">
                          <ActionIcon
                            variant="subtle"
                            color="teal"
                            size="sm"
                            onClick={() => selectFolder(dir.path)}
                          >
                            <IconCheck size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </UnstyledButton>
                  ))}
                </Stack>
              )}
            </ScrollArea>
          </Paper>

          {/* Select current folder */}
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Current: <code>{currentPath}</code>
            </Text>
            <Button
              size="sm"
              color="brand"
              leftSection={<IconCheck size={14} />}
              onClick={selectCurrentPath}
            >
              Select This Folder
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
