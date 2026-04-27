'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Stack,
  NavLink,
  Text,
  Group,
  ThemeIcon,
  Divider,
  Box,
  Badge,
  ScrollArea,
  Tooltip,
  Skeleton,
  Loader,
} from '@mantine/core';
import {
  IconSettings,
  IconActivity,
  IconFolder,
  IconBook,
} from '@tabler/icons-react';
import { NAV_ITEMS, PROJECT_TYPE_ICONS } from '@/lib/constants';
import classes from './Sidebar.module.css';

interface SidebarProps {
  pathname: string;
  onNavigate: () => void;
}

interface SidebarProject {
  id: string;
  name: string;
  type: string;
  hasActiveChat: boolean;
}

export function Sidebar({ pathname, onNavigate }: SidebarProps) {
  const [projects, setProjects] = useState<SidebarProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects?sidebar=true');
      if (!res.ok) return;
      const data = await res.json();
      setProjects(
        data.map((p: Record<string, unknown>) => ({
          id: p.id as string,
          name: p.name as string,
          type: p.type as string,
          hasActiveChat: p.hasActiveChat === true,
        })),
      );
    } catch {
      // Silently fail
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    // Refresh every 5s so the "in progress" loader appears/disappears
    // promptly after a chat starts or finishes streaming.
    const timer = setInterval(fetchProjects, 5_000);
    return () => clearInterval(timer);
  }, [fetchProjects]);

  return (
    <Stack justify="space-between" h="100%" p="sm" gap={0}>
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" py="xs">
          Navigation
        </Text>

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            component={Link}
            href={item.href}
            label={item.label}
            active={
              item.href === '/projects'
                ? pathname === '/projects'
                : pathname.startsWith(item.href)
            }
            leftSection={
              <ThemeIcon
                variant={pathname.startsWith(item.href) ? 'light' : 'subtle'}
                color={pathname.startsWith(item.href) ? 'brand' : 'gray'}
                size="md"
                radius="md"
              >
                <item.icon size={16} />
              </ThemeIcon>
            }
            className={classes.navLink}
            onClick={onNavigate}
            styles={{
              root: {
                borderRadius: 'var(--mantine-radius-md)',
              },
            }}
          />
        ))}

        <Divider my="sm" color="dark.5" />

        {/* Projects quick access */}
        <Group px="sm" py="xs" justify="space-between">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Projects
          </Text>
          {projects.length > 0 && (
            <Badge size="xs" variant="light" color="dark.3">
              {projects.length}
            </Badge>
          )}
        </Group>

        <ScrollArea
          style={{ flex: 1, minHeight: 0 }}
          scrollbarSize={4}
          offsetScrollbars
        >
          <Stack gap={2}>
            {loadingProjects ? (
              <>
                <Skeleton height={32} radius="md" />
                <Skeleton height={32} radius="md" />
                <Skeleton height={32} radius="md" />
              </>
            ) : projects.length === 0 ? (
              <Text size="xs" c="dimmed" px="sm" py="xs">
                No projects yet
              </Text>
            ) : (
              projects.map((project) => {
                const isActive = pathname === `/projects/${project.id}`;
                const Icon =
                  PROJECT_TYPE_ICONS[
                    project.type as keyof typeof PROJECT_TYPE_ICONS
                  ] || IconFolder;

                return (
                  <NavLink
                    key={project.id}
                    component={Link}
                    href={`/projects/${project.id}`}
                    label={
                      <Group gap={6} wrap="nowrap">
                        <Text size="xs" lineClamp={1} style={{ flex: 1 }}>
                          {project.name}
                        </Text>
                        {project.hasActiveChat && (
                          <Tooltip label="Chat is processing…">
                            <Loader size={12} type="oval" color="brand" />
                          </Tooltip>
                        )}
                      </Group>
                    }
                    active={isActive}
                    leftSection={
                      <ThemeIcon
                        variant={isActive ? 'light' : 'subtle'}
                        color={isActive ? 'brand' : 'gray'}
                        size="sm"
                        radius="md"
                      >
                        <Icon size={12} />
                      </ThemeIcon>
                    }
                    className={classes.navLink}
                    onClick={onNavigate}
                    styles={{
                      root: {
                        borderRadius: 'var(--mantine-radius-md)',
                        padding: '4px 8px',
                      },
                    }}
                  />
                );
              })
            )}
          </Stack>
        </ScrollArea>

        <Divider my="sm" color="dark.5" />

        <NavLink
          component={Link}
          href="/devices/setup"
          label="Setup Guide"
          leftSection={
            <ThemeIcon
              variant={pathname === '/devices/setup' ? 'light' : 'subtle'}
              color={pathname === '/devices/setup' ? 'brand' : 'gray'}
              size="md"
              radius="md"
            >
              <IconBook size={16} />
            </ThemeIcon>
          }
          active={pathname === '/devices/setup'}
          className={classes.navLink}
          onClick={onNavigate}
          styles={{
            root: {
              borderRadius: 'var(--mantine-radius-md)',
            },
          }}
        />

        <NavLink
          component={Link}
          href="/settings"
          label="Settings"
          active={pathname === '/settings'}
          leftSection={
            <ThemeIcon
              variant={pathname === '/settings' ? 'light' : 'subtle'}
              color={pathname === '/settings' ? 'brand' : 'gray'}
              size="md"
              radius="md"
            >
              <IconSettings size={16} />
            </ThemeIcon>
          }
          className={classes.navLink}
          onClick={onNavigate}
          styles={{
            root: {
              borderRadius: 'var(--mantine-radius-md)',
            },
          }}
        />
      </Box>

      {/* Status Footer */}
      <Box className={classes.statusFooter}>
        <Divider mb="sm" color="dark.5" />
        <Group gap="xs" px="sm" py="xs">
          <IconActivity size={14} style={{ opacity: 0.5 }} />
          <Text size="xs" c="dimmed">
            System Status
          </Text>
          <Badge size="xs" color="teal" variant="dot" ml="auto">
            OK
          </Badge>
        </Group>
      </Box>
    </Stack>
  );
}
