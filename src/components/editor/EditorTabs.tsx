'use client';

import { Group, UnstyledButton, Text, ActionIcon, ScrollArea, Tooltip, Box } from '@mantine/core';
import {
  IconX,
  IconBrandTypescript,
  IconBrandJavascript,
  IconBrandCss3,
  IconBrandPython,
  IconBrandReact,
  IconJson,
  IconFile,
} from '@tabler/icons-react';

export interface EditorTab {
  path: string;
  name: string;
  dirty: boolean;
  content: string;
  originalContent: string;
}

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTab: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

const tabIcons: Record<string, typeof IconFile> = {
  ts: IconBrandTypescript,
  tsx: IconBrandReact,
  js: IconBrandJavascript,
  jsx: IconBrandReact,
  css: IconBrandCss3,
  py: IconBrandPython,
  json: IconJson,
};

function getTabIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return tabIcons[ext] || IconFile;
}

export function EditorTabs({ tabs, activeTab, onSelect, onClose }: EditorTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <Box
      style={{
        borderBottom: '1px solid var(--mantine-color-dark-6)',
        backgroundColor: 'var(--mantine-color-dark-8)',
      }}
    >
      <ScrollArea scrollbarSize={4} type="auto">
        <Group gap={0} wrap="nowrap">
          {tabs.map((tab) => {
            const isActive = tab.path === activeTab;
            const TabIcon = getTabIcon(tab.name);

            return (
              <UnstyledButton
                key={tab.path}
                py={6}
                px={12}
                onClick={() => onSelect(tab.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isActive
                    ? 'var(--mantine-color-dark-6)'
                    : 'transparent',
                  borderRight: '1px solid var(--mantine-color-dark-7)',
                  borderBottom: isActive
                    ? '2px solid var(--mantine-color-brand-5)'
                    : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  minWidth: 'fit-content',
                  transition: 'background-color 0.1s',
                }}
              >
                <TabIcon size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                <Text size="xs" c={isActive ? 'gray.2' : 'dimmed'} style={{ userSelect: 'none' }}>
                  {tab.name}
                </Text>
                {tab.dirty && (
                  <Box
                    w={6}
                    h={6}
                    style={{
                      borderRadius: '50%',
                      backgroundColor: 'var(--mantine-color-brand-5)',
                      flexShrink: 0,
                    }}
                  />
                )}
                <Tooltip label="Close (⌘W)">
                  <ActionIcon
                    variant="subtle"
                    size={14}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(tab.path);
                    }}
                    style={{ opacity: isActive ? 0.6 : 0.3 }}
                  >
                    <IconX size={10} />
                  </ActionIcon>
                </Tooltip>
              </UnstyledButton>
            );
          })}
        </Group>
      </ScrollArea>
    </Box>
  );
}
