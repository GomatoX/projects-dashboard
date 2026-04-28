'use client';

// Viešas preview puslapis – naudoja tą pačią DiffEditor konfigūraciją kaip
// produkcinis `DiffViewerModal`, tik su mock turiniu, kad rezultatą būtų
// galima parodyti screenshot'e be auth/agento.

import { useCallback, useState } from 'react';
import {
  AppShell,
  Box,
  Group,
  Stack,
  Text,
  Badge,
  SegmentedControl,
  Button,
  Title,
  Paper,
  useMantineColorScheme,
  Tooltip,
  ActionIcon,
} from '@mantine/core';
import {
  IconColumns2,
  IconBaselineDensitySmall,
  IconSun,
  IconMoon,
  IconCode,
  IconRefresh,
} from '@tabler/icons-react';
import { DiffEditor, type BeforeMount } from '@monaco-editor/react';
import { registerMonacoThemes, themeForColorScheme } from '@/lib/monacoThemes';
import { getMonacoLanguage } from '@/lib/monacoLanguage';

const ORIGINAL = `// User authentication helper
import { useState } from 'react';
import { signIn } from '@/lib/auth-client';

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await signIn.email({ email, password });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p>{error}</p>}
      <button type="submit">Sign in</button>
    </form>
  );
}
`;

const MODIFIED = `// User authentication helper
import { useState, useTransition } from 'react';
import { signIn } from '@/lib/auth-client';
import { notify } from '@/lib/notify';

interface LoginFormProps {
  onSuccess?: () => void;
  redirectTo?: string;
}

export function LoginForm({ onSuccess, redirectTo }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn.email({ email, password, callbackURL: redirectTo });
      if (res.error) {
        setError(res.error.message);
        notify({ title: 'Login failed', message: res.error.message, color: 'red' });
        return;
      }
      notify({ title: 'Welcome back', message: email, color: 'teal' });
      onSuccess?.();
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        autoComplete="email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
`;

const FILE_PATH = 'src/components/auth/LoginForm.tsx';

export default function DiffPreviewPage() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const resolved: 'light' | 'dark' = colorScheme === 'light' ? 'light' : 'dark';
  const [layout, setLayout] = useState<'side-by-side' | 'inline'>('side-by-side');

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    registerMonacoThemes(monaco);
  }, []);

  const monacoTheme = themeForColorScheme(resolved);
  const language = getMonacoLanguage(FILE_PATH);

  return (
    <AppShell padding="md" header={{ height: 56 }}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <IconCode size={20} />
            <Title order={5}>Diff viewer preview</Title>
            <Badge variant="light" color="brand" size="sm">
              {monacoTheme}
            </Badge>
          </Group>
          <Group gap="xs">
            <Button
              size="xs"
              variant={resolved === 'light' ? 'filled' : 'light'}
              leftSection={<IconSun size={14} />}
              onClick={() => setColorScheme('light')}
            >
              Light
            </Button>
            <Button
              size="xs"
              variant={resolved === 'dark' ? 'filled' : 'light'}
              leftSection={<IconMoon size={14} />}
              onClick={() => setColorScheme('dark')}
            >
              Dark
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="md" h="calc(100vh - 88px)">
          <Paper
            withBorder
            radius="md"
            p={0}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {/* Diff header bar – mirrors the modal header */}
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
                <Badge size="md" variant="light" color="yellow">
                  Modified
                </Badge>
                <Text size="sm" fw={600} truncate style={{ fontFamily: 'monospace' }}>
                  {FILE_PATH}
                </Text>
                <Badge size="xs" color="teal" variant="outline">
                  +14 / −3
                </Badge>
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
                  <ActionIcon variant="subtle" size="sm">
                    <IconRefresh size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>

            <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <DiffEditor
                height="100%"
                language={language}
                original={ORIGINAL}
                modified={MODIFIED}
                theme={monacoTheme}
                beforeMount={handleBeforeMount}
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
            </Box>
          </Paper>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
