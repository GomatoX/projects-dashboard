'use client';

import { useRef, useCallback } from 'react';
import { Box, Center, Text, Stack, Loader, useMantineColorScheme } from '@mantine/core';
import { IconCode } from '@tabler/icons-react';
import Editor, {
  type OnMount,
  type OnChange,
  type BeforeMount,
} from '@monaco-editor/react';
import { registerMonacoThemes, themeForColorScheme } from '@/lib/monacoThemes';
import { getMonacoLanguage } from '@/lib/monacoLanguage';

interface CodeEditorProps {
  path: string;
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

export function CodeEditor({ path, content, onChange, onSave }: CodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const { colorScheme } = useMantineColorScheme();
  const resolvedScheme: 'light' | 'dark' = colorScheme === 'light' ? 'light' : 'dark';

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    registerMonacoThemes(monaco);
  }, []);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      // Add Cmd+S / Ctrl+S save keybinding
      editor.addAction({
        id: 'save-file',
        label: 'Save File',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          onSave();
        },
      });

      // Focus editor
      editor.focus();
    },
    [onSave],
  );

  const handleChange: OnChange = useCallback(
    (value) => {
      if (value !== undefined) {
        onChange(value);
      }
    },
    [onChange],
  );

  return (
    <Box style={{ flex: 1, overflow: 'hidden' }}>
      <Editor
        height="100%"
        language={getMonacoLanguage(path)}
        value={content}
        theme={themeForColorScheme(resolvedScheme)}
        beforeMount={handleBeforeMount}
        onChange={handleChange}
        onMount={handleMount}
        loading={
          <Center h="100%">
            <Loader color="brand" size="sm" type="dots" />
          </Center>
        }
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
          fontLigatures: true,
          minimap: { enabled: true, scale: 1 },
          scrollBeyondLastLine: false,
          renderLineHighlight: 'all',
          lineNumbers: 'on',
          wordWrap: 'on',
          tabSize: 2,
          insertSpaces: true,
          formatOnPaste: true,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          padding: { top: 12 },
          suggest: {
            showWords: true,
          },
          quickSuggestions: true,
        }}
      />
    </Box>
  );
}

// ─── Empty State ──────────────────────────────────────────

export function CodeEditorEmpty() {
  return (
    <Center h="100%" style={{ flex: 1 }}>
      <Stack align="center" gap="sm">
        <IconCode size={48} style={{ opacity: 0.15 }} />
        <Text size="sm" c="dimmed">
          Select a file from the tree to open it
        </Text>
        <Text size="xs" c="dimmed">
          ⌘S to save · ⌘W to close tab
        </Text>
      </Stack>
    </Center>
  );
}
