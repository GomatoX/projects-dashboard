'use client';

// Side-by-side diff peržiūra atskiram failui.
//
// Naudoja Monaco `DiffEditor`, kad gautume natūralų original → modified
// sugretinimą su highlight'ais. Tema susinchronizuota su Mantine spalvų
// schema (One Dark Pro / One Light), tas pats stilius kaip CodeEditor'iuje.

import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Group,
  Stack,
  Text,
  Badge,
  ActionIcon,
  Center,
  Loader,
  Box,
  Alert,
  Tooltip,
  SegmentedControl,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconRefresh,
  IconAlertTriangle,
  IconColumns2,
  IconBaselineDensitySmall,
} from '@tabler/icons-react';
import { DiffEditor, type BeforeMount, type DiffOnMount } from '@monaco-editor/react';
import { registerMonacoThemes, themeForColorScheme } from '@/lib/monacoThemes';
import { getMonacoLanguage } from '@/lib/monacoLanguage';

interface DiffViewerModalProps {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  filePath: string | null;
  // Determines kurią versijų porą imame iš git'o.
  mode: 'unstaged' | 'staged' | 'untracked';
  // Status raidė (M, A, D, ?, R) – rodome Badge'e.
  statusChar?: string;
}

interface DiffData {
  path: string;
  original: string;
  modified: string;
  isNew: boolean;
  isDeleted: boolean;
}

const statusLabel: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  '?': 'Untracked',
  R: 'Renamed',
};

const statusColor: Record<string, string> = {
  M: 'yellow',
  A: 'teal',
  D: 'red',
  '?': 'gray',
  R: 'blue',
};

export function DiffViewerModal({
  opened,
  onClose,
  projectId,
  filePath,
  mode,
  statusChar,
}: DiffViewerModalProps) {
  const { colorScheme } = useMantineColorScheme();
  const resolvedScheme: 'light' | 'dark' = colorScheme === 'light' ? 'light' : 'dark';

  const [data, setData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<'side-by-side' | 'inline'>('side-by-side');

  const fetchDiff = useCallback(async () => {
    if (!filePath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'GIT_DIFF_FILE', path: filePath, mode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      if (json.type === 'GIT_DIFF_FILE_RESULT') {
        setData({
          path: json.path,
          original: json.original ?? '',
          modified: json.modified ?? '',
          isNew: !!json.isNew,
          isDeleted: !!json.isDeleted,
        });
      } else if (json.type === 'COMMAND_ERROR') {
        throw new Error(json.message || 'Diff failed');
      } else {
        throw new Error('Unexpected response');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Diff load failed');
    } finally {
      setLoading(false);
    }
  }, [projectId, filePath, mode]);

  useEffect(() => {
    if (opened && filePath) {
      void fetchDiff();
    } else if (!opened) {
      // Modaliam užsidarius išvalom, kad kitą kartą nepamatytume seno turinio.
      setData(null);
      setError(null);
    }
  }, [opened, filePath, fetchDiff]);

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    registerMonacoThemes(monaco);
  }, []);

  const handleMount: DiffOnMount = useCallback(() => {
    // Hook'as paliktas ateičiai (pvz. focus / komandų registravimas).
  }, []);

  const language = filePath ? getMonacoLanguage(filePath) : 'plaintext';
  const theme = themeForColorScheme(resolvedScheme);

  const sChar = statusChar || (mode === 'untracked' ? '?' : 'M');

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="90vw"
      centered
      withCloseButton={false}
      padding={0}
      styles={{
        content: { height: '88vh', display: 'flex', flexDirection: 'column' },
        body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 0 },
      }}
      overlayProps={{ backgroundOpacity: 0.6, blur: 3 }}
      title={null}
    >
      {/* Header */}
      <Group
        justify="space-between"
        px="md"
        py="sm"
        style={{
          borderBottom:
            '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
          backgroundColor:
            'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))',
        }}
      >
        <Group gap="sm" style={{ minWidth: 0, flex: 1 }}>
          <Badge
            size="md"
            variant="light"
            color={statusColor[sChar] || 'gray'}
            style={{ flexShrink: 0 }}
          >
            {statusLabel[sChar] || sChar}
          </Badge>
          <Text size="sm" fw={600} truncate style={{ fontFamily: 'monospace' }}>
            {filePath || ''}
          </Text>
          {data?.isNew && (
            <Badge size="xs" color="teal" variant="outline">
              new file
            </Badge>
          )}
          {data?.isDeleted && (
            <Badge size="xs" color="red" variant="outline">
              deleted
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            value={layout}
            onChange={(v) => setLayout(v as 'side-by-side' | 'inline')}
            data={[
              {
                value: 'side-by-side',
                label: (
                  <Group gap={4} wrap="nowrap">
                    <IconColumns2 size={12} />
                    <span>Side-by-side</span>
                  </Group>
                ),
              },
              {
                value: 'inline',
                label: (
                  <Group gap={4} wrap="nowrap">
                    <IconBaselineDensitySmall size={12} />
                    <span>Inline</span>
                  </Group>
                ),
              },
            ]}
          />
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" size="sm" onClick={fetchDiff}>
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
          <ActionIcon variant="subtle" size="sm" onClick={onClose}>
            <Text size="lg" lh={1}>
              ×
            </Text>
          </ActionIcon>
        </Group>
      </Group>

      {/* Body */}
      <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && !data ? (
          <Center h="100%">
            <Stack align="center" gap="sm">
              <Loader color="brand" type="dots" />
              <Text size="xs" c="dimmed">
                Loading diff…
              </Text>
            </Stack>
          </Center>
        ) : error ? (
          <Box p="md">
            <Alert
              variant="light"
              color="red"
              icon={<IconAlertTriangle size={18} />}
              title="Diff request failed"
            >
              {error}
            </Alert>
          </Box>
        ) : data ? (
          <DiffEditor
            height="100%"
            language={language}
            original={data.original}
            modified={data.modified}
            theme={theme}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            options={{
              readOnly: true,
              originalEditable: false,
              renderSideBySide: layout === 'side-by-side',
              fontSize: 13,
              fontFamily:
                "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              renderLineHighlight: 'all',
              lineNumbers: 'on',
              wordWrap: 'on',
              renderWhitespace: 'selection',
              diffWordWrap: 'on',
              ignoreTrimWhitespace: false,
              renderOverviewRuler: true,
              padding: { top: 8 },
              guides: {
                indentation: true,
              },
              smoothScrolling: true,
            }}
          />
        ) : null}
      </Box>
    </Modal>
  );
}
