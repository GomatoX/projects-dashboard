'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Title,
  Text,
  Group,
  Badge,
  Tabs,
  Center,
  Loader,
  ThemeIcon,
  ActionIcon,
  Box,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconGitBranch,
  IconCpu,
  IconMessageCircle,
  IconCode,
  IconBrain,
  IconTerminal,
  IconSparkles,
} from '@tabler/icons-react';
import { PROJECT_TYPE_ICONS } from '@/lib/constants';
import { PM2Panel } from '@/components/pm2/PM2Panel';
import { EditorPanel } from '@/components/editor/EditorPanel';
import { GitPanel } from '@/components/git/GitPanel';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { MemoryPanel } from '@/components/memory/MemoryPanel';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { SkillsPanel } from '@/components/skills/SkillsPanel';

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

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
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
          <Badge key={tag} size="md" variant="filled" color="gray">
            {tag}
          </Badge>
        ))}
      </Group>

      {/* Tabs */}
      <Tabs defaultValue="chat" variant="pills" radius="md" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="chat" leftSection={<IconMessageCircle size={16} />}>
            Chat
          </Tabs.Tab>
          <Tabs.Tab value="git" leftSection={<IconGitBranch size={16} />}>
            Git
          </Tabs.Tab>
          <Tabs.Tab value="editor" leftSection={<IconCode size={16} />}>
            Editor
          </Tabs.Tab>
          <Tabs.Tab value="terminal" leftSection={<IconTerminal size={16} />}>
            Terminal
          </Tabs.Tab>
          <Tabs.Tab value="pm2" leftSection={<IconCpu size={16} />}>
            PM2
          </Tabs.Tab>
          <Tabs.Tab value="skills" leftSection={<IconSparkles size={16} />}>
            Skills
          </Tabs.Tab>
          <Tabs.Tab value="memory" leftSection={<IconBrain size={16} />}>
            Memory
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel
          value="chat"
          keepMounted
          style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
        >
          <ChatPanel projectId={project.id} deviceId={project.deviceId} />
        </Tabs.Panel>

        <Tabs.Panel value="git" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <GitPanel
            projectId={project.id}
            projectPath={project.path}
            deviceId={project.deviceId}
          />
        </Tabs.Panel>

        <Tabs.Panel value="editor" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <EditorPanel
            projectId={project.id}
            projectPath={project.path}
            deviceId={project.deviceId}
          />
        </Tabs.Panel>

        <Tabs.Panel value="terminal" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <TerminalPanel projectId={project.id} deviceId={project.deviceId} />
        </Tabs.Panel>

        <Tabs.Panel value="pm2" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <PM2Panel
            projectId={project.id}
            pm2Name={project.pm2Name}
            deviceId={project.deviceId}
          />
        </Tabs.Panel>

        <Tabs.Panel value="skills" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <SkillsPanel projectId={project.id} deviceId={project.deviceId} />
        </Tabs.Panel>

        <Tabs.Panel value="memory" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <MemoryPanel projectId={project.id} />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
