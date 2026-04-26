'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
  Stack,
  Group,
  Text,
  Badge,
  Tabs,
  Button,
  Code,
  Card,
  Loader,
  Center,
  Box,
  ScrollArea,
  Avatar,
  ThemeIcon,
} from '@mantine/core';
import {
  IconFileText,
  IconGitCompare,
  IconSparkles,
  IconPlus,
  IconMinus,
  IconAlertTriangle,
  IconCheck,
  IconShieldCheck,
  IconBulb,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { PRDetail, PRFile } from '@/lib/github';

interface PRDetailDrawerProps {
  projectId: string;
  prNumber: number | null;
  opened: boolean;
  onClose: () => void;
}

interface AISummary {
  summary: string;
  changes: string[];
  risks: string[];
  suggestions: string[];
  complexity: string;
  categories: string[];
}

const COMPLEXITY_COLORS: Record<string, string> = {
  low: 'teal',
  medium: 'yellow',
  high: 'red',
};

export function PRDetailDrawer({
  projectId,
  prNumber,
  opened,
  onClose,
}: PRDetailDrawerProps) {
  const [detail, setDetail] = useState<PRDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<AISummary | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const fetchDetail = useCallback(async () => {
    if (!prNumber) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/github/${prNumber}`);
      const data = await res.json();
      setDetail(data);
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to load PR details',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, prNumber]);

  useEffect(() => {
    if (opened && prNumber) {
      setDetail(null);
      setSummary(null);
      setExpandedFiles(new Set());
      fetchDetail();
    }
  }, [opened, prNumber, fetchDetail]);

  const generateSummary = async () => {
    if (!prNumber) return;
    setSummarizing(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/github/${prNumber}/summary`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (data.summary) {
        setSummary(data.summary);
        notifications.show({
          title: 'Summary generated',
          message: 'AI review is ready',
          color: 'teal',
          autoClose: 2000,
        });
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to generate summary',
        color: 'red',
      });
    } finally {
      setSummarizing(false);
    }
  };

  const toggleFile = (filename: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        detail ? (
          <Group gap="sm">
            <Text size="sm" fw={600}>
              #{detail.number}
            </Text>
            <Text size="sm" fw={600} lineClamp={1}>
              {detail.title}
            </Text>
          </Group>
        ) : (
          'Pull Request'
        )
      }
      position="right"
      size="xl"
      styles={{
        body: { padding: 0 },
        header: {
          borderBottom: '1px solid var(--mantine-color-dark-5)',
          backgroundColor: 'var(--mantine-color-dark-8)',
        },
      }}
    >
      {loading ? (
        <Center h={300}>
          <Loader color="brand" type="dots" />
        </Center>
      ) : detail ? (
        <Box p="md">
          {/* PR metadata */}
          <Group gap="xs" mb="sm">
            <Avatar src={detail.authorAvatar} size={20} radius="xl" />
            <Text size="xs" c="dimmed">
              {detail.author}
            </Text>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Text size="xs" c="dimmed">
              {detail.branch} → {detail.baseBranch}
            </Text>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Group gap={4}>
              <IconPlus size={12} color="var(--mantine-color-teal-5)" />
              <Text size="xs" c="teal.5">
                {detail.additions}
              </Text>
              <IconMinus size={12} color="var(--mantine-color-red-5)" />
              <Text size="xs" c="red.5">
                {detail.deletions}
              </Text>
            </Group>
            {detail.checksStatus && (
              <Badge
                size="xs"
                color={
                  detail.checksStatus === 'success'
                    ? 'teal'
                    : detail.checksStatus === 'failure'
                      ? 'red'
                      : 'yellow'
                }
                variant="light"
              >
                CI: {detail.checksStatus}
              </Badge>
            )}
          </Group>

          <Tabs defaultValue="summary" variant="pills" radius="md">
            <Tabs.List mb="md">
              <Tabs.Tab
                value="summary"
                leftSection={<IconSparkles size={14} />}
              >
                AI Summary
              </Tabs.Tab>
              <Tabs.Tab
                value="files"
                leftSection={<IconFileText size={14} />}
              >
                Files ({detail.changedFiles})
              </Tabs.Tab>
              <Tabs.Tab
                value="diff"
                leftSection={<IconGitCompare size={14} />}
              >
                Diff
              </Tabs.Tab>
            </Tabs.List>

            {/* AI Summary Tab */}
            <Tabs.Panel value="summary">
              {summary ? (
                <Stack gap="md">
                  {/* Summary */}
                  <Card
                    p="sm"
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      border: '1px solid var(--mantine-color-dark-5)',
                    }}
                  >
                    <Group gap="xs" mb="xs">
                      <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                        Summary
                      </Text>
                      <Badge
                        size="xs"
                        color={
                          COMPLEXITY_COLORS[summary.complexity] || 'gray'
                        }
                      >
                        {summary.complexity} complexity
                      </Badge>
                      {summary.categories?.map((c) => (
                        <Badge key={c} size="xs" variant="outline" color="dark.3">
                          {c}
                        </Badge>
                      ))}
                    </Group>
                    <Text size="sm">{summary.summary}</Text>
                  </Card>

                  {/* Changes */}
                  {summary.changes?.length > 0 && (
                    <Card
                      p="sm"
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        border: '1px solid var(--mantine-color-dark-5)',
                      }}
                    >
                      <Group gap="xs" mb="xs">
                        <ThemeIcon size={18} variant="light" color="teal" radius="sm">
                          <IconCheck size={10} />
                        </ThemeIcon>
                        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                          Key Changes
                        </Text>
                      </Group>
                      <Stack gap={4}>
                        {summary.changes.map((c, i) => (
                          <Text key={i} size="sm" c="dimmed">
                            • {c}
                          </Text>
                        ))}
                      </Stack>
                    </Card>
                  )}

                  {/* Risks */}
                  {summary.risks?.length > 0 && (
                    <Card
                      p="sm"
                      style={{
                        backgroundColor: 'rgba(255, 200, 0, 0.03)',
                        border: '1px solid var(--mantine-color-yellow-9)',
                      }}
                    >
                      <Group gap="xs" mb="xs">
                        <ThemeIcon size={18} variant="light" color="yellow" radius="sm">
                          <IconAlertTriangle size={10} />
                        </ThemeIcon>
                        <Text size="xs" fw={600} c="yellow.4" tt="uppercase">
                          Risks
                        </Text>
                      </Group>
                      <Stack gap={4}>
                        {summary.risks.map((r, i) => (
                          <Text key={i} size="sm" c="dimmed">
                            ⚠ {r}
                          </Text>
                        ))}
                      </Stack>
                    </Card>
                  )}

                  {/* Suggestions */}
                  {summary.suggestions?.length > 0 && (
                    <Card
                      p="sm"
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        border: '1px solid var(--mantine-color-dark-5)',
                      }}
                    >
                      <Group gap="xs" mb="xs">
                        <ThemeIcon size={18} variant="light" color="blue" radius="sm">
                          <IconBulb size={10} />
                        </ThemeIcon>
                        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                          Suggestions
                        </Text>
                      </Group>
                      <Stack gap={4}>
                        {summary.suggestions.map((s, i) => (
                          <Text key={i} size="sm" c="dimmed">
                            💡 {s}
                          </Text>
                        ))}
                      </Stack>
                    </Card>
                  )}

                  <Button
                    variant="subtle"
                    size="xs"
                    color="brand"
                    leftSection={<IconSparkles size={14} />}
                    onClick={generateSummary}
                    loading={summarizing}
                  >
                    Regenerate
                  </Button>
                </Stack>
              ) : (
                <Center py="xl">
                  <Stack align="center" gap="md">
                    <ThemeIcon size={48} variant="light" color="brand" radius="xl">
                      <IconSparkles size={24} />
                    </ThemeIcon>
                    <Text size="sm" c="dimmed" ta="center">
                      Generate an AI-powered analysis of this PR
                    </Text>
                    <Button
                      color="brand"
                      leftSection={<IconSparkles size={16} />}
                      onClick={generateSummary}
                      loading={summarizing}
                    >
                      Summarize with AI
                    </Button>
                  </Stack>
                </Center>
              )}
            </Tabs.Panel>

            {/* Files Tab */}
            <Tabs.Panel value="files">
              <ScrollArea h="calc(100vh - 250px)">
                <Stack gap={4}>
                  {detail.files.map((file) => (
                    <FileCard
                      key={file.filename}
                      file={file}
                      expanded={expandedFiles.has(file.filename)}
                      onToggle={() => toggleFile(file.filename)}
                    />
                  ))}
                </Stack>
              </ScrollArea>
            </Tabs.Panel>

            {/* Diff Tab */}
            <Tabs.Panel value="diff">
              <ScrollArea h="calc(100vh - 250px)">
                <Code
                  block
                  style={{
                    fontSize: 11,
                    lineHeight: 1.5,
                    backgroundColor: 'var(--mantine-color-dark-8)',
                    whiteSpace: 'pre',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {detail.diff || 'No diff available'}
                </Code>
              </ScrollArea>
            </Tabs.Panel>
          </Tabs>
        </Box>
      ) : null}
    </Drawer>
  );
}

// ─── File Card ────────────────────────────────────────────

function FileCard({
  file,
  expanded,
  onToggle,
}: {
  file: PRFile;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColors: Record<string, string> = {
    added: 'teal',
    removed: 'red',
    modified: 'yellow',
    renamed: 'blue',
  };

  return (
    <Card
      p="xs"
      style={{
        backgroundColor: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        cursor: file.patch ? 'pointer' : 'default',
      }}
      onClick={file.patch ? onToggle : undefined}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Badge
            size="xs"
            color={statusColors[file.status] || 'gray'}
            variant="light"
            style={{ flexShrink: 0 }}
          >
            {file.status.charAt(0).toUpperCase()}
          </Badge>
          <Text size="xs" lineClamp={1} style={{ fontFamily: 'monospace' }}>
            {file.filename}
          </Text>
        </Group>
        <Group gap="xs" style={{ flexShrink: 0 }}>
          <Text size="xs" c="teal.5">
            +{file.additions}
          </Text>
          <Text size="xs" c="red.5">
            -{file.deletions}
          </Text>
          {file.patch && (
            expanded ? (
              <IconChevronUp size={12} style={{ opacity: 0.4 }} />
            ) : (
              <IconChevronDown size={12} style={{ opacity: 0.4 }} />
            )
          )}
        </Group>
      </Group>

      {expanded && file.patch && (
        <Code
          block
          mt="xs"
          style={{
            fontSize: 10,
            lineHeight: 1.4,
            backgroundColor: 'var(--mantine-color-dark-8)',
            whiteSpace: 'pre',
            maxHeight: 400,
            overflowY: 'auto',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {file.patch}
        </Code>
      )}
    </Card>
  );
}
