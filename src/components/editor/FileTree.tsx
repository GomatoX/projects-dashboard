'use client';

import { useState, useCallback } from 'react';
import {
  Text,
  Group,
  Box,
  UnstyledButton,
  ScrollArea,
  Loader,
  Center,
  TextInput,
  ActionIcon,
  Tooltip,
  Stack,
  Collapse,
} from '@mantine/core';
import {
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconChevronRight,
  IconChevronDown,
  IconRefresh,
  IconSearch,
  IconBrandTypescript,
  IconBrandJavascript,
  IconBrandCss3,
  IconBrandHtml5,
  IconBrandPython,
  IconBrandReact,
  IconJson,
  IconMarkdown,
  IconFileText,
  IconPhoto,
  IconSettings,
} from '@tabler/icons-react';
import type { FileEntry } from '@/lib/socket/types';

interface FileTreeProps {
  projectId: string;
  projectPath: string;
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
}

interface TreeNode extends FileEntry {
  children?: TreeNode[];
  loaded?: boolean;
  loading?: boolean;
  fullPath: string;
}

const fileIcons: Record<string, typeof IconFile> = {
  ts: IconBrandTypescript,
  tsx: IconBrandReact,
  js: IconBrandJavascript,
  jsx: IconBrandReact,
  css: IconBrandCss3,
  html: IconBrandHtml5,
  py: IconBrandPython,
  json: IconJson,
  md: IconMarkdown,
  txt: IconFileText,
  png: IconPhoto,
  jpg: IconPhoto,
  svg: IconPhoto,
  yml: IconSettings,
  yaml: IconSettings,
  toml: IconSettings,
  env: IconSettings,
};

const fileColors: Record<string, string> = {
  ts: '#3178c6',
  tsx: '#61dafb',
  js: '#f7df1e',
  jsx: '#61dafb',
  css: '#264de4',
  html: '#e34c26',
  py: '#3776ab',
  json: '#a8b9cc',
  md: '#ffffff',
};

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return fileIcons[ext] || IconFile;
}

function getFileColor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return fileColors[ext] || '#888';
}

export function FileTree({
  projectId,
  projectPath,
  onFileSelect,
  selectedFile,
}: FileTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [initialLoaded, setInitialLoaded] = useState(false);

  const fetchDirectory = useCallback(
    async (dirPath: string): Promise<TreeNode[]> => {
      try {
        const res = await fetch(`/api/projects/${projectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'LIST_FILES',
            path: dirPath,
            recursive: false,
          }),
        });

        if (!res.ok) return [];
        const data = await res.json();

        if (data.type === 'FILE_LIST') {
          return (data.entries as FileEntry[])
            .sort((a, b) => {
              // Directories first, then alphabetical
              if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((entry) => ({
              ...entry,
              fullPath: `${dirPath}/${entry.path}`,
              children: entry.isDirectory ? [] : undefined,
              loaded: false,
              loading: false,
            }));
        }
        return [];
      } catch {
        return [];
      }
    },
    [projectId],
  );

  const loadRoot = useCallback(async () => {
    setLoading(true);
    const rootEntries = await fetchDirectory(projectPath);
    setTree(rootEntries);
    setInitialLoaded(true);
    setLoading(false);
  }, [fetchDirectory, projectPath]);

  // Load on first render
  if (!initialLoaded && !loading) {
    loadRoot();
  }

  const toggleDirectory = async (node: TreeNode) => {
    const key = node.fullPath;

    if (expandedDirs.has(key)) {
      // Collapse
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }

    // Expand — load children if needed
    if (!node.loaded) {
      // Mark loading
      setTree((prev) => updateNodeInTree(prev, key, { loading: true }));

      const children = await fetchDirectory(node.fullPath);

      setTree((prev) =>
        updateNodeInTree(prev, key, { children, loaded: true, loading: false }),
      );
    }

    setExpandedDirs((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  if (loading && !initialLoaded) {
    return (
      <Center h={200}>
        <Loader color="brand" size="sm" type="dots" />
      </Center>
    );
  }

  return (
    <Stack gap={0} h="100%">
      {/* Search + Refresh */}
      <Group gap={4} p="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-6)' }}>
        <TextInput
          size="xs"
          placeholder="Search files..."
          leftSection={<IconSearch size={12} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          style={{ flex: 1 }}
          styles={{
            input: {
              backgroundColor: 'var(--mantine-color-dark-7)',
              border: 'none',
              fontSize: 12,
            },
          }}
        />
        <Tooltip label="Refresh">
          <ActionIcon variant="subtle" size="sm" onClick={loadRoot}>
            <IconRefresh size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Tree */}
      <ScrollArea style={{ flex: 1 }} type="auto">
        <Box py={4}>
          {tree.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="md">
              No files found
            </Text>
          ) : (
            tree
              .filter(
                (node) =>
                  !searchQuery || node.name.toLowerCase().includes(searchQuery.toLowerCase()),
              )
              .map((node) => (
                <TreeItem
                  key={node.fullPath}
                  node={node}
                  depth={0}
                  expandedDirs={expandedDirs}
                  selectedFile={selectedFile}
                  onToggle={toggleDirectory}
                  onFileSelect={onFileSelect}
                  searchQuery={searchQuery}
                />
              ))
          )}
        </Box>
      </ScrollArea>
    </Stack>
  );
}

// ─── Tree Item Component ──────────────────────────────────

function TreeItem({
  node,
  depth,
  expandedDirs,
  selectedFile,
  onToggle,
  onFileSelect,
  searchQuery,
}: {
  node: TreeNode;
  depth: number;
  expandedDirs: Set<string>;
  selectedFile: string | null;
  onToggle: (node: TreeNode) => void;
  onFileSelect: (path: string) => void;
  searchQuery: string;
}) {
  const isExpanded = expandedDirs.has(node.fullPath);
  const isSelected = selectedFile === node.fullPath;
  const isDir = node.isDirectory;
  const FileIcon = isDir
    ? isExpanded
      ? IconFolderOpen
      : IconFolder
    : getFileIcon(node.name);
  const iconColor = isDir ? '#e8a838' : getFileColor(node.name);

  return (
    <>
      <UnstyledButton
        w="100%"
        py={2}
        px={8}
        style={{
          paddingLeft: depth * 16 + 8,
          backgroundColor: isSelected
            ? 'rgba(0, 200, 200, 0.1)'
            : 'transparent',
          borderLeft: isSelected ? '2px solid var(--mantine-color-brand-5)' : '2px solid transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          transition: 'background-color 0.1s',
        }}
        onClick={() => {
          if (isDir) {
            onToggle(node);
          } else {
            onFileSelect(node.fullPath);
          }
        }}
        onDoubleClick={() => {
          if (!isDir) {
            onFileSelect(node.fullPath);
          }
        }}
      >
        {/* Chevron for directories */}
        {isDir ? (
          node.loading ? (
            <Loader size={12} color="brand" />
          ) : (
            isExpanded ? (
              <IconChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
            ) : (
              <IconChevronRight size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
            )
          )
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        <FileIcon size={14} color={iconColor} style={{ flexShrink: 0 }} />

        <Text
          size="xs"
          truncate
          style={{
            flex: 1,
            color: isSelected ? 'var(--mantine-color-brand-4)' : 'var(--mantine-color-gray-4)',
          }}
        >
          {node.name}
        </Text>
      </UnstyledButton>

      {/* Children */}
      {isDir && isExpanded && node.children && (
        <>
          {node.children
            .filter(
              (child) =>
                !searchQuery ||
                child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                child.isDirectory,
            )
            .map((child) => (
              <TreeItem
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                selectedFile={selectedFile}
                onToggle={onToggle}
                onFileSelect={onFileSelect}
                searchQuery={searchQuery}
              />
            ))}
        </>
      )}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────

function updateNodeInTree(
  nodes: TreeNode[],
  targetPath: string,
  updates: Partial<TreeNode>,
): TreeNode[] {
  return nodes.map((node) => {
    if (node.fullPath === targetPath) {
      return { ...node, ...updates };
    }
    if (node.children) {
      return { ...node, children: updateNodeInTree(node.children, targetPath, updates) };
    }
    return node;
  });
}
