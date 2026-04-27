'use client';

import {
  Title,
  Text,
  Card,
  Stack,
  Group,
  Code,
  Box,
  Badge,
  List,
  Stepper,
  CopyButton,
  ActionIcon,
  Tooltip,
  Paper,
  Divider,
  Alert,
  Anchor,
  Button,
} from '@mantine/core';
import {
  IconServer,
  IconTerminal2,
  IconCheck,
  IconCopy,
  IconArrowLeft,
  IconInfoCircle,
  IconBrandApple,
  IconBrandUbuntu,
  IconDeviceDesktop,
  IconShieldCheck,
  IconDownload,
} from '@tabler/icons-react';
import Link from 'next/link';

function CopyBlock({ code, label }: { code: string; label?: string }) {
  return (
    <Paper
      p="md"
      radius="md"
      style={{
        backgroundColor: 'var(--mantine-color-dark-9)',
        border: '1px solid var(--mantine-color-dark-5)',
        position: 'relative',
      }}
    >
      {label && (
        <Group gap="xs" mb="xs">
          <IconTerminal2 size={14} style={{ opacity: 0.5 }} />
          <Text size="xs" c="dimmed">
            {label}
          </Text>
        </Group>
      )}
      <Group justify="flex-end" style={{ position: 'absolute', top: 12, right: 12 }}>
        <CopyButton value={code}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied!' : 'Copy'}>
              <ActionIcon
                variant="subtle"
                color={copied ? 'teal' : 'gray'}
                onClick={copy}
                size="sm"
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
        {code}
      </Code>
    </Paper>
  );
}

export default function DeviceSetupGuidePage() {
  const dashboardUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  return (
    <>
      <Group mb="xl" gap="lg">
        <ActionIcon
          component={Link}
          href="/guides"
          variant="subtle"
          color="gray"
          size="lg"
        >
          <IconArrowLeft size={20} />
        </ActionIcon>
        <Box>
          <Title order={2} fw={700}>
            Device Setup
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Connect a new machine to your dashboard
          </Text>
        </Box>
      </Group>

      <Stack gap="xl" maw={800}>
        {/* Overview */}
        <Alert
          icon={<IconInfoCircle size={18} />}
          title="How it works"
          color="brand"
          variant="light"
        >
          The agent is a lightweight Node.js process that runs on your dev machine.
          It connects to this dashboard via WebSocket and provides access to files,
          Git, PM2, and a terminal — all from this web UI.
        </Alert>

        {/* Prerequisites */}
        <Card>
          <Stack gap="md">
            <Group gap="sm">
              <IconShieldCheck size={20} style={{ opacity: 0.6 }} />
              <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                Prerequisites
              </Text>
            </Group>
            <List spacing="sm" size="sm">
              <List.Item>
                <b>Node.js 20+</b> — <Code>brew install node</Code> (macOS) or{' '}
                <Code>curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs</Code> (Linux)
              </List.Item>
              <List.Item>
                <b>pnpm</b> — <Code>npm install -g pnpm</Code>
              </List.Item>
              <List.Item>
                <b>Build tools</b> (for terminal feature) —{' '}
                <Code>xcode-select --install</Code> (macOS) or{' '}
                <Code>sudo apt install -y python3 make g++</Code> (Linux)
              </List.Item>
            </List>
          </Stack>
        </Card>

        {/* Step-by-step */}
        <Card>
          <Stack gap="lg">
            <Text size="sm" fw={600} tt="uppercase" c="dimmed">
              Setup Steps
            </Text>

            <Stepper
              active={-1}
              orientation="vertical"
              color="brand"
              styles={{
                stepIcon: { backgroundColor: 'var(--mantine-color-dark-7)' },
              }}
            >
              {/* Step 1 */}
              <Stepper.Step
                label="Generate a device token"
                description="From the dashboard"
              >
                <Stack gap="sm" mt="sm">
                  <Text size="sm">
                    Go to{' '}
                    <Text component={Link} href="/devices" c="brand" fw={500} inherit>
                      Devices → Add Device
                    </Text>
                    , enter a name and OS, then click <b>Generate Token</b>.
                  </Text>
                  <Text size="sm" c="dimmed">
                    The token is a one-time secret that authenticates the agent.
                    It expires in 10 minutes.
                  </Text>
                </Stack>
              </Stepper.Step>

              {/* Step 2 - Automated */}
              <Stepper.Step
                label="Run the install script"
                description="Automated setup"
              >
                <Stack gap="sm" mt="sm">
                  <Text size="sm">
                    The install script lives on this dashboard — pipe it
                    straight into bash. It downloads the agent source from{' '}
                    <Anchor
                      href="/api/agent/download"
                      c="brand"
                      fw={500}
                      inherit
                    >
                      /api/agent/download
                    </Anchor>{' '}
                    and registers it as a background service.
                  </Text>

                  <Group gap="xs" mt="xs">
                    <Badge
                      leftSection={<IconBrandApple size={10} />}
                      variant="light"
                      color="gray"
                      size="sm"
                    >
                      macOS
                    </Badge>
                    <Anchor
                      href="/install/mac"
                      target="_blank"
                      size="xs"
                      c="dimmed"
                    >
                      view script
                    </Anchor>
                  </Group>
                  <CopyBlock
                    label="Terminal"
                    code={`curl -fsSL ${dashboardUrl}/install/mac | bash -s -- \\
  ${dashboardUrl} \\
  YOUR_TOKEN_HERE`}
                  />

                  <Group gap="xs" mt="xs">
                    <Badge
                      leftSection={<IconBrandUbuntu size={10} />}
                      variant="light"
                      color="gray"
                      size="sm"
                    >
                      Linux
                    </Badge>
                    <Anchor
                      href="/install/linux"
                      target="_blank"
                      size="xs"
                      c="dimmed"
                    >
                      view script
                    </Anchor>
                  </Group>
                  <CopyBlock
                    label="Terminal"
                    code={`curl -fsSL ${dashboardUrl}/install/linux | bash -s -- \\
  ${dashboardUrl} \\
  YOUR_TOKEN_HERE`}
                  />

                  <Text size="xs" c="dimmed">
                    The script installs to <Code>~/.dev-dashboard-agent</Code>{' '}
                    and registers as a launchd/systemd service.
                  </Text>
                </Stack>
              </Stepper.Step>

              {/* Step 2 alt - Manual */}
              <Stepper.Step
                label="Or: manual setup"
                description="For development / testing"
              >
                <Stack gap="sm" mt="sm">
                  <Text size="sm">
                    Grab the agent source as a tarball from this dashboard, or
                    clone the repo if you have access.
                  </Text>
                  <Group>
                    <Button
                      component="a"
                      href="/api/agent/download"
                      leftSection={<IconDownload size={14} />}
                      variant="light"
                      size="xs"
                    >
                      Download agent.tar.gz
                    </Button>
                  </Group>
                  <CopyBlock
                    label="Terminal"
                    code={`# Option A — extract the tarball
mkdir -p ~/dev-dashboard-agent
curl -fsSL ${dashboardUrl}/api/agent/download \\
  | tar -xzf - -C ~/dev-dashboard-agent
cd ~/dev-dashboard-agent

# Option B — clone the repo
# git clone <your-repo> dev-dashboard && cd dev-dashboard/agent

# Configure
cp .env.example .env
# Edit .env:
#   DASHBOARD_URL=${dashboardUrl}
#   AGENT_TOKEN=your_token
#   PROJECT_PATHS=$HOME/projects,$HOME/Desktop/Projects

# Install & run
pnpm install
pnpm dev`}
                  />
                </Stack>
              </Stepper.Step>

              {/* Step 3 */}
              <Stepper.Step
                label="Verify connection"
                description="Check the dashboard"
              >
                <Stack gap="sm" mt="sm">
                  <Text size="sm">
                    Return to the{' '}
                    <Text component={Link} href="/devices" c="brand" fw={500} inherit>
                      Devices page
                    </Text>
                    . Your device should appear with a green{' '}
                    <Badge size="xs" color="teal" variant="dot">
                      online
                    </Badge>{' '}
                    indicator.
                  </Text>
                  <Text size="sm" c="dimmed">
                    The agent automatically discovers projects in your configured
                    paths and reports them to the dashboard.
                  </Text>
                </Stack>
              </Stepper.Step>
            </Stepper>
          </Stack>
        </Card>

        {/* Agent .env reference */}
        <Card>
          <Stack gap="md">
            <Group gap="sm">
              <IconServer size={20} style={{ opacity: 0.6 }} />
              <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                Agent Configuration Reference
              </Text>
            </Group>
            <CopyBlock
              label=".env"
              code={`# Required
DASHBOARD_URL=${dashboardUrl}
AGENT_TOKEN=<your-token>

# Optional
AGENT_NAME=my-macbook       # Device display name
AGENT_PORT=3939             # Agent HTTP port (unused currently)
PROJECT_PATHS=$HOME/projects,$HOME/Desktop/Projects`}
            />
          </Stack>
        </Card>

        {/* Management commands */}
        <Card>
          <Stack gap="md">
            <Group gap="sm">
              <IconDeviceDesktop size={20} style={{ opacity: 0.6 }} />
              <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                Management Commands
              </Text>
            </Group>

            <Divider label="macOS (launchd)" labelPosition="left" />
            <CopyBlock
              code={`# View logs
tail -f ~/.dev-dashboard-agent/agent.log

# Restart agent
launchctl unload ~/Library/LaunchAgents/com.devdashboard.agent.plist
launchctl load ~/Library/LaunchAgents/com.devdashboard.agent.plist

# Stop agent
launchctl unload ~/Library/LaunchAgents/com.devdashboard.agent.plist

# Uninstall
rm -rf ~/.dev-dashboard-agent
rm ~/Library/LaunchAgents/com.devdashboard.agent.plist`}
            />

            <Divider label="Linux (systemd)" labelPosition="left" />
            <CopyBlock
              code={`# View logs
journalctl --user -u dev-dashboard-agent -f

# Restart agent
systemctl --user restart dev-dashboard-agent

# Stop agent
systemctl --user stop dev-dashboard-agent

# Uninstall
systemctl --user disable --now dev-dashboard-agent
rm -rf ~/.dev-dashboard-agent
rm ~/.config/systemd/user/dev-dashboard-agent.service`}
            />
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
