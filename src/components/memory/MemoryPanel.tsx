'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Stack,
  Card,
  Group,
  Text,
  Textarea,
  Button,
  Badge,
  ActionIcon,
  Tooltip,
  TextInput,
  Box,
  Center,
  Loader,
  Divider,
  ThemeIcon,
  Tabs,
} from '@mantine/core';
import { notify } from '@/lib/notify';
import {
  IconBrain,
  IconDeviceFloppy,
  IconRefresh,
  IconCode,
  IconFileText,
  IconPinned,
  IconPlus,
  IconTrash,
  IconRobot,
  IconNotes,
  IconBuildingArch,
  IconBook,
  IconClock,
} from '@tabler/icons-react';

interface ProjectMemoryData {
  projectId: string;
  systemPrompt: string;
  pinnedFiles: string;
  conventions: string;
  notes: string;
  architecture: string;
  updatedAt: string;
}

interface MemoryPanelProps {
  projectId: string;
}

function estimateTokens(text: string): number {
  // Rough estimation: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

export function MemoryPanel({ projectId }: MemoryPanelProps) {
  const [memory, setMemory] = useState<ProjectMemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newPinnedFile, setNewPinnedFile] = useState('');

  const fetchMemory = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/memory`);
      const data = await res.json();
      setMemory(data);
      setDirty(false);
    } catch {
      notify({ title: 'Error', message: 'Failed to load memory', color: 'red' });
    }
  }, [projectId]);

  useEffect(() => {
    (async () => {
      await fetchMemory();
      setLoading(false);
    })();
  }, [fetchMemory]);

  const updateField = (field: keyof ProjectMemoryData, value: string) => {
    if (!memory) return;
    setMemory({ ...memory, [field]: value });
    setDirty(true);
  };

  const saveMemory = async () => {
    if (!memory) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/memory`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memory),
      });

      if (res.ok) {
        const updated = await res.json();
        setMemory({ ...memory, updatedAt: updated.updatedAt });
        setDirty(false);
        notify({ title: 'Saved', message: 'Project memory updated', color: 'teal', autoClose: 1500 });
      }
    } catch {
      notify({ title: 'Error', message: 'Failed to save memory', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const pinnedFiles: string[] = memory ? JSON.parse(memory.pinnedFiles || '[]') : [];

  const addPinnedFile = () => {
    if (!newPinnedFile.trim() || !memory) return;
    const updated = [...pinnedFiles, newPinnedFile.trim()];
    updateField('pinnedFiles', JSON.stringify(updated));
    setNewPinnedFile('');
  };

  const removePinnedFile = (index: number) => {
    const updated = pinnedFiles.filter((_, i) => i !== index);
    updateField('pinnedFiles', JSON.stringify(updated));
  };

  if (loading) {
    return (
      <Center h={300}>
        <Loader color="brand" type="dots" size="lg" />
      </Center>
    );
  }

  if (!memory) return null;

  const totalTokens =
    estimateTokens(memory.systemPrompt) +
    estimateTokens(memory.conventions) +
    estimateTokens(memory.notes) +
    estimateTokens(memory.architecture);

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Group gap="sm">
          <ThemeIcon size="lg" variant="light" color="brand" radius="md">
            <IconBrain size={20} />
          </ThemeIcon>
          <div>
            <Text size="sm" fw={600}>Project Memory</Text>
            <Text size="xs" c="dimmed">
              Context auto-included in every AI chat for this project
            </Text>
          </div>
        </Group>

        <Group gap="xs">
          <Badge
            size="sm"
            variant="light"
            color={totalTokens > 4000 ? 'yellow' : 'teal'}
          >
            ~{totalTokens.toLocaleString()} tokens
          </Badge>
          {dirty && (
            <Badge size="sm" variant="filled" color="yellow">
              Unsaved
            </Badge>
          )}
          <Button
            size="xs"
            color="brand"
            leftSection={<IconDeviceFloppy size={14} />}
            loading={saving}
            disabled={!dirty}
            onClick={saveMemory}
          >
            Save
          </Button>
        </Group>
      </Group>

      <Tabs defaultValue="system" variant="pills" radius="md">
        <Tabs.List mb="md">
          <Tabs.Tab value="system" leftSection={<IconRobot size={14} />}>
            System Prompt
          </Tabs.Tab>
          <Tabs.Tab value="conventions" leftSection={<IconBook size={14} />}>
            Conventions
          </Tabs.Tab>
          <Tabs.Tab value="architecture" leftSection={<IconBuildingArch size={14} />}>
            Architecture
          </Tabs.Tab>
          <Tabs.Tab value="notes" leftSection={<IconNotes size={14} />}>
            Notes
          </Tabs.Tab>
          <Tabs.Tab
            value="pinned"
            leftSection={<IconPinned size={14} />}
            rightSection={
              pinnedFiles.length > 0 ? (
                <Badge size="xs" variant="filled" color="brand" circle>
                  {pinnedFiles.length}
                </Badge>
              ) : null
            }
          >
            Pinned Files
          </Tabs.Tab>
        </Tabs.List>

        {/* System Prompt */}
        <Tabs.Panel value="system">
          <Card>
            <Group justify="space-between" mb="sm">
              <div>
                <Text size="sm" fw={600}>System Prompt</Text>
                <Text size="xs" c="dimmed">
                  Custom instructions prepended to every AI conversation
                </Text>
              </div>
              <Badge size="xs" variant="outline" color="dark.3">
                ~{estimateTokens(memory.systemPrompt)} tokens
              </Badge>
            </Group>
            <Textarea
              placeholder="e.g. You are an expert Next.js developer. This project uses App Router, Drizzle ORM, and Mantine UI. Always use TypeScript strict mode..."
              value={memory.systemPrompt}
              onChange={(e) => updateField('systemPrompt', e.currentTarget.value)}
              autosize
              minRows={6}
              maxRows={20}
              styles={{
                input: {
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  border: '1px solid var(--mantine-color-dark-5)',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  lineHeight: 1.6,
                },
              }}
            />
          </Card>
        </Tabs.Panel>

        {/* Conventions */}
        <Tabs.Panel value="conventions">
          <Card>
            <Group justify="space-between" mb="sm">
              <div>
                <Text size="sm" fw={600}>Coding Conventions</Text>
                <Text size="xs" c="dimmed">
                  Style guides, naming patterns, and project-specific rules
                </Text>
              </div>
              <Badge size="xs" variant="outline" color="dark.3">
                ~{estimateTokens(memory.conventions)} tokens
              </Badge>
            </Group>
            <Textarea
              placeholder={`e.g.\n- Use camelCase for variables, PascalCase for components\n- Prefer named exports\n- Use 'use client' directive only when needed\n- Error handling: always use try-catch with typed errors`}
              value={memory.conventions}
              onChange={(e) => updateField('conventions', e.currentTarget.value)}
              autosize
              minRows={6}
              maxRows={20}
              styles={{
                input: {
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  border: '1px solid var(--mantine-color-dark-5)',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  lineHeight: 1.6,
                },
              }}
            />
          </Card>
        </Tabs.Panel>

        {/* Architecture */}
        <Tabs.Panel value="architecture">
          <Card>
            <Group justify="space-between" mb="sm">
              <div>
                <Text size="sm" fw={600}>Architecture Notes</Text>
                <Text size="xs" c="dimmed">
                  Tech stack, folder structure, database schema, key patterns
                </Text>
              </div>
              <Badge size="xs" variant="outline" color="dark.3">
                ~{estimateTokens(memory.architecture)} tokens
              </Badge>
            </Group>
            <Textarea
              placeholder={`e.g.\n## Stack\n- Next.js 16 (App Router)\n- Drizzle ORM + SQLite\n- Mantine 8 UI\n\n## Key Patterns\n- Agent-based architecture via WebSocket\n- All file ops proxied through agent`}
              value={memory.architecture}
              onChange={(e) => updateField('architecture', e.currentTarget.value)}
              autosize
              minRows={6}
              maxRows={20}
              styles={{
                input: {
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  border: '1px solid var(--mantine-color-dark-5)',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  lineHeight: 1.6,
                },
              }}
            />
          </Card>
        </Tabs.Panel>

        {/* Notes */}
        <Tabs.Panel value="notes">
          <Card>
            <Group justify="space-between" mb="sm">
              <div>
                <Text size="sm" fw={600}>General Notes</Text>
                <Text size="xs" c="dimmed">
                  TODOs, known issues, important context for the AI
                </Text>
              </div>
              <Badge size="xs" variant="outline" color="dark.3">
                ~{estimateTokens(memory.notes)} tokens
              </Badge>
            </Group>
            <Textarea
              placeholder="e.g. Known issue: PM2 log streaming disconnects after 10 minutes. TODO: Add reconnection logic."
              value={memory.notes}
              onChange={(e) => updateField('notes', e.currentTarget.value)}
              autosize
              minRows={6}
              maxRows={20}
              styles={{
                input: {
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  border: '1px solid var(--mantine-color-dark-5)',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  lineHeight: 1.6,
                },
              }}
            />
          </Card>
        </Tabs.Panel>

        {/* Pinned Files */}
        <Tabs.Panel value="pinned">
          <Card>
            <Group justify="space-between" mb="sm">
              <div>
                <Text size="sm" fw={600}>Pinned Files</Text>
                <Text size="xs" c="dimmed">
                  File paths auto-loaded and included as context in AI chats
                </Text>
              </div>
              <Badge size="xs" variant="light" color="brand">
                {pinnedFiles.length} files
              </Badge>
            </Group>

            <Group gap="sm" mb="md">
              <TextInput
                size="xs"
                placeholder="src/lib/db/schema.ts"
                value={newPinnedFile}
                onChange={(e) => setNewPinnedFile(e.currentTarget.value)}
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
                  if (e.key === 'Enter') addPinnedFile();
                }}
              />
              <Button
                size="xs"
                color="brand"
                leftSection={<IconPlus size={12} />}
                disabled={!newPinnedFile.trim()}
                onClick={addPinnedFile}
              >
                Pin
              </Button>
            </Group>

            {pinnedFiles.length === 0 ? (
              <Text size="xs" c="dimmed">
                No pinned files. Add file paths that should be included as context in AI conversations.
              </Text>
            ) : (
              <Stack gap={2}>
                {pinnedFiles.map((file, index) => (
                  <Group
                    key={`${file}-${index}`}
                    justify="space-between"
                    py={4}
                    px={8}
                    style={{
                      borderRadius: 'var(--mantine-radius-xs)',
                      backgroundColor: 'rgba(0, 200, 200, 0.03)',
                      border: '1px solid var(--mantine-color-dark-6)',
                    }}
                  >
                    <Group gap="xs">
                      <IconFileText size={12} style={{ opacity: 0.4 }} />
                      <Text
                        size="xs"
                        style={{ fontFamily: 'monospace' }}
                      >
                        {file}
                      </Text>
                    </Group>
                    <Tooltip label="Unpin">
                      <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="red"
                        onClick={() => removePinnedFile(index)}
                      >
                        <IconTrash size={10} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>

      {/* Footer */}
      {memory.updatedAt && (
        <Group gap="xs" justify="flex-end">
          <IconClock size={12} style={{ opacity: 0.3 }} />
          <Text size="xs" c="dimmed">
            Last updated: {new Date(memory.updatedAt).toLocaleString()}
          </Text>
        </Group>
      )}
    </Stack>
  );
}
