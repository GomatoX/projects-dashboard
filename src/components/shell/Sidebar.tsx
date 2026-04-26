'use client';

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
} from '@mantine/core';
import { IconSettings, IconActivity } from '@tabler/icons-react';
import { NAV_ITEMS } from '@/lib/constants';
import classes from './Sidebar.module.css';

interface SidebarProps {
  pathname: string;
  onNavigate: () => void;
}

export function Sidebar({ pathname, onNavigate }: SidebarProps) {
  return (
    <Stack justify="space-between" h="100%" p="sm" gap={0}>
      <Stack gap={4}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" py="xs">
          Navigation
        </Text>

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            component={Link}
            href={item.href}
            label={item.label}
            active={pathname.startsWith(item.href)}
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
      </Stack>

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
