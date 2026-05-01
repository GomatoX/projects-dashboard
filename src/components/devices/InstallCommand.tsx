'use client';

// Shared install-command panel. Used by both AddDeviceModal (post-create)
// and ReinstallCommandModal (post-rotate). Pure presentational — the parent
// is responsible for fetching the raw token. Once mounted, this component
// shows the curl one-liner with a copy button plus a manual-run snippet.
//
// We intentionally render the raw token plainly (no masking). This panel is
// only displayed inside an explicit modal action — the user just clicked
// "Generate" or "Show install command". A reveal/hide toggle would add UI
// without changing the underlying threat model: the token is on screen because
// the user asked for it. Anyone over their shoulder is also looking at the
// confirm dialog they just dismissed.

import {
  Stack,
  Text,
  Code,
  Group,
  CopyButton,
  ActionIcon,
  Tooltip,
  Paper,
} from '@mantine/core';
import { IconCopy, IconCheck, IconTerminal2 } from '@tabler/icons-react';

interface InstallCommandProps {
  rawToken: string;
  os: string;
  /**
   * Optional — when set, the heading reads "Run this command on <name>:".
   * When omitted (e.g. caller doesn't know the name), the heading is generic.
   */
  deviceName?: string;
  /**
   * Override for the dashboard origin used in the install command. Defaults
   * to `window.location.origin`. Mostly useful for tests or for surfacing
   * the LAN IP instead of localhost.
   */
  dashboardUrl?: string;
}

export function InstallCommand({
  rawToken,
  os,
  deviceName,
  dashboardUrl,
}: InstallCommandProps) {
  const origin =
    dashboardUrl ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  // Match the existing curl shape used by AddDeviceModal — the install
  // scripts under /install/{mac,linux} are positional: $1=dashboardUrl,
  // $2=token. Keep them in sync if the script signature ever changes.
  const installScript =
    os === 'darwin'
      ? `curl -fsSL ${origin}/install/mac | bash -s -- \\
  ${origin} \\
  ${rawToken}`
      : `curl -fsSL ${origin}/install/linux | bash -s -- \\
  ${origin} \\
  ${rawToken}`;

  const manualScript = `cd agent && cp .env.example .env
# Edit .env with your token
DASHBOARD_URL=${origin}
AGENT_TOKEN=${rawToken}

pnpm install && pnpm dev`;

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        {deviceName ? (
          <>
            Run this command on <b>{deviceName}</b> to install the agent:
          </>
        ) : (
          <>Run this command on the device to install the agent:</>
        )}
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
                  aria-label="Copy install command"
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
        <Code block style={{ backgroundColor: 'transparent', fontSize: '12px' }}>
          {manualScript}
        </Code>
      </Paper>
    </Stack>
  );
}
