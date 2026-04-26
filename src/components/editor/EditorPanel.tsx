'use client';

import { useState, useCallback } from 'react';
import { Box, Group, Center, Text, Stack, Loader, Badge, ActionIcon, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconDeviceFloppy } from '@tabler/icons-react';
import { FileTree } from './FileTree';
import { EditorTabs, type EditorTab } from './EditorTabs';
import { CodeEditor, CodeEditorEmpty } from './CodeEditor';

interface EditorPanelProps {
  projectId: string;
  projectPath: string;
  deviceId: string | null;
}

export function EditorPanel({ projectId, projectPath, deviceId }: EditorPanelProps) {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const openFile = useCallback(
    async (path: string) => {
      // If already open, just activate
      const existing = tabs.find((t) => t.path === path);
      if (existing) {
        setActiveTab(path);
        return;
      }

      // Load file content from agent
      setLoadingFile(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'READ_FILE', path }),
        });

        if (!res.ok) {
          notifications.show({
            title: 'Error',
            message: 'Failed to load file',
            color: 'red',
          });
          return;
        }

        const data = await res.json();

        if (data.type === 'FILE_CONTENT') {
          const name = path.split('/').pop() || 'untitled';
          const newTab: EditorTab = {
            path,
            name,
            dirty: false,
            content: data.content,
            originalContent: data.content,
          };

          setTabs((prev) => [...prev, newTab]);
          setActiveTab(path);
        } else if (data.type === 'COMMAND_ERROR') {
          notifications.show({
            title: 'Error',
            message: data.message || 'Failed to read file',
            color: 'red',
          });
        }
      } catch {
        notifications.show({
          title: 'Error',
          message: 'Failed to load file',
          color: 'red',
        });
      } finally {
        setLoadingFile(false);
      }
    },
    [projectId, tabs],
  );

  const closeTab = useCallback(
    (path: string) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.path !== path);

        // If closing the active tab, switch to adjacent
        if (activeTab === path) {
          const idx = prev.findIndex((t) => t.path === path);
          const next = filtered[Math.min(idx, filtered.length - 1)];
          setActiveTab(next?.path || null);
        }

        return filtered;
      });
    },
    [activeTab],
  );

  const updateContent = useCallback(
    (path: string, value: string) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.path === path
            ? { ...tab, content: value, dirty: value !== tab.originalContent }
            : tab,
        ),
      );
    },
    [],
  );

  const saveFile = useCallback(
    async (path: string) => {
      const tab = tabs.find((t) => t.path === path);
      if (!tab) return;

      try {
        const res = await fetch(`/api/projects/${projectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'WRITE_FILE',
            path,
            content: tab.content,
          }),
        });

        const data = await res.json();

        if (data.type === 'FILE_WRITTEN' && data.success) {
          setTabs((prev) =>
            prev.map((t) =>
              t.path === path
                ? { ...t, dirty: false, originalContent: t.content }
                : t,
            ),
          );
          notifications.show({
            title: 'Saved',
            message: tab.name,
            color: 'teal',
            autoClose: 1500,
          });
        } else {
          notifications.show({
            title: 'Save failed',
            message: data.message || 'Could not write file',
            color: 'red',
          });
        }
      } catch {
        notifications.show({
          title: 'Error',
          message: 'Failed to save file',
          color: 'red',
        });
      }
    },
    [projectId, tabs],
  );

  const activeTabData = tabs.find((t) => t.path === activeTab);
  const dirtyCount = tabs.filter((t) => t.dirty).length;

  if (!deviceId) {
    return (
      <Center h={400}>
        <Stack align="center" gap="sm">
          <IconAlertTriangle size={40} style={{ opacity: 0.3 }} />
          <Text c="dimmed">No device assigned to this project</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Box
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 500,
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-dark-6)',
        overflow: 'hidden',
        backgroundColor: 'var(--mantine-color-dark-8)',
      }}
    >
      {/* File Tree Sidebar */}
      <Box
        style={{
          width: 260,
          minWidth: 200,
          borderRight: '1px solid var(--mantine-color-dark-6)',
          backgroundColor: 'var(--mantine-color-dark-9)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Group
          gap="xs"
          px="sm"
          py={8}
          style={{
            borderBottom: '1px solid var(--mantine-color-dark-6)',
          }}
        >
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ flex: 1 }}>
            Explorer
          </Text>
          {dirtyCount > 0 && (
            <Badge size="xs" variant="light" color="brand">
              {dirtyCount} unsaved
            </Badge>
          )}
        </Group>
        <FileTree
          projectId={projectId}
          projectPath={projectPath}
          onFileSelect={openFile}
          selectedFile={activeTab}
        />
      </Box>

      {/* Editor Area */}
      <Box
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Tab bar */}
        <EditorTabs
          tabs={tabs}
          activeTab={activeTab}
          onSelect={setActiveTab}
          onClose={closeTab}
        />

        {/* Status bar (only when a file is active) */}
        {activeTabData && (
          <Group
            gap="xs"
            px="sm"
            py={3}
            style={{
              backgroundColor: 'var(--mantine-color-dark-9)',
              borderBottom: '1px solid var(--mantine-color-dark-7)',
            }}
          >
            <Text size="xs" c="dimmed" style={{ flex: 1 }} truncate>
              {activeTabData.path}
            </Text>
            {activeTabData.dirty && (
              <Tooltip label="Save (⌘S)">
                <ActionIcon
                  variant="light"
                  size="xs"
                  color="brand"
                  onClick={() => saveFile(activeTabData.path)}
                >
                  <IconDeviceFloppy size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        )}

        {/* Monaco or empty state */}
        {loadingFile ? (
          <Center style={{ flex: 1 }}>
            <Loader color="brand" size="sm" type="dots" />
          </Center>
        ) : activeTabData ? (
          <CodeEditor
            key={activeTabData.path}
            path={activeTabData.path}
            content={activeTabData.content}
            onChange={(value) => updateContent(activeTabData.path, value)}
            onSave={() => saveFile(activeTabData.path)}
          />
        ) : (
          <CodeEditorEmpty />
        )}
      </Box>
    </Box>
  );
}
