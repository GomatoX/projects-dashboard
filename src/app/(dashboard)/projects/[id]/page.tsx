'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Title,
  Text,
  Group,
  Badge,
  Tabs,
  Card,
  Stack,
  Center,
  Loader,
  ThemeIcon,
  Code,
  ActionIcon,
  Box,
  SimpleGrid,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconGitBranch,
  IconCpu,
  IconMessageCircle,
  IconCode,
  IconBrain,
  IconFolder,
  IconLock,
} from '@tabler/icons-react';
import { PROJECT_TYPE_ICONS } from '@/lib/constants';
import { PM2Panel } from '@/components/pm2/PM2Panel';
import { EditorPanel } from '@/components/editor/EditorPanel';
import { GitPanel } from '@/components/git/GitPanel';

interface Project {
  id: string;
  name: string;
  type: string;
  path: string;
  tags: string;
  pm2Name: string | null;
  github: string | null;
  deviceId: string | null;
  createdAt: string;
  deviceName?: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/projects/${params.id}`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        setProject(data);
      } catch {
        router.push('/projects');
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [params.id, router]);

  if (loading || !project) {
    return (
      <Center h={400}>
        <Loader color="brand" type="dots" size="lg" />
      </Center>
    );
  }

  const Icon = PROJECT_TYPE_ICONS[project.type] || PROJECT_TYPE_ICONS.other;
  const parsedTags: string[] = (() => {
    try {
      return JSON.parse(project.tags);
    } catch {
      return [];
    }
  })();

  const lockedTab = (label: string, icon: React.ReactNode) => (
    <Group gap={6} wrap="nowrap">
      {icon}
      <span>{label}</span>
      <IconLock size={12} style={{ opacity: 0.4 }} />
    </Group>
  );

  return (
    <>
      {/* Back button + header */}
      <Group mb="xl" gap="lg">
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={() => router.push('/projects')}
        >
          <IconArrowLeft size={20} />
        </ActionIcon>

        <Group gap="sm">
          <ThemeIcon size="xl" radius="md" variant="light" color="brand">
            <Icon size={24} />
          </ThemeIcon>
          <Box>
            <Title order={2} fw={700}>
              {project.name}
            </Title>
            <Text size="sm" c="dimmed">
              {project.path}
            </Text>
          </Box>
        </Group>
      </Group>

      {/* Badges */}
      <Group gap="xs" mb="xl">
        <Badge size="md" variant="light" color="brand">
          {project.type}
        </Badge>
        {project.pm2Name && (
          <Badge size="md" variant="outline" color="teal">
            PM2: {project.pm2Name}
          </Badge>
        )}
        {parsedTags.map((tag) => (
          <Badge key={tag} size="md" variant="filled" color="dark.5">
            {tag}
          </Badge>
        ))}
      </Group>

      {/* Tabs */}
      <Tabs defaultValue="overview" variant="pills" radius="md">
        <Tabs.List mb="lg">
          <Tabs.Tab value="overview" leftSection={<IconFolder size={16} />}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab value="git" leftSection={<IconGitBranch size={16} />}>
            Git
          </Tabs.Tab>
          <Tabs.Tab value="pm2" leftSection={<IconCpu size={16} />}>
            PM2
          </Tabs.Tab>
          <Tabs.Tab value="chat" leftSection={<IconMessageCircle size={16} />} disabled>
            {lockedTab('Chat', null)}
          </Tabs.Tab>
          <Tabs.Tab value="editor" leftSection={<IconCode size={16} />}>
            Editor
          </Tabs.Tab>
          <Tabs.Tab value="memory" leftSection={<IconBrain size={16} />} disabled>
            {lockedTab('Memory', null)}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Card>
              <Stack gap="sm">
                <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                  Project Info
                </Text>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Type</Text>
                  <Badge variant="light" color="brand">{project.type}</Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Path</Text>
                  <Code>{project.path}</Code>
                </Group>
                {project.pm2Name && (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">PM2 Name</Text>
                    <Code>{project.pm2Name}</Code>
                  </Group>
                )}
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Created</Text>
                  <Text size="sm">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </Text>
                </Group>
              </Stack>
            </Card>

            <Card>
              <Stack gap="sm">
                <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                  Quick Actions
                </Text>
                <Text size="sm" c="dimmed">
                  More features will be unlocked as you complete more sprints — Git, PM2,
                  AI Chat, Code Editor, and Project Memory.
                </Text>
                <Group>
                  <Badge
                    size="lg"
                    variant="outline"
                    color="dark.3"
                    leftSection={<IconGitBranch size={14} />}
                  >
                    Sprint 4.5
                  </Badge>
                  <Badge
                    size="lg"
                    variant="outline"
                    color="dark.3"
                    leftSection={<IconCpu size={14} />}
                  >
                    Sprint 3
                  </Badge>
                  <Badge
                    size="lg"
                    variant="outline"
                    color="dark.3"
                    leftSection={<IconMessageCircle size={14} />}
                  >
                    Sprint 5
                  </Badge>
                </Group>
              </Stack>
            </Card>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="pm2">
          <PM2Panel
            projectId={project.id}
            pm2Name={project.pm2Name}
            deviceId={project.deviceId}
          />
        </Tabs.Panel>

        <Tabs.Panel value="editor">
          <EditorPanel
            projectId={project.id}
            projectPath={project.path}
            deviceId={project.deviceId}
          />
        </Tabs.Panel>

        <Tabs.Panel value="git">
          <GitPanel
            projectId={project.id}
            projectPath={project.path}
            deviceId={project.deviceId}
          />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
