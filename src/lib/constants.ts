import {
  IconFolder,
  IconDeviceDesktop,
  IconCpu,
  IconBrandNextjs,
  IconBrandNodejs,
  IconBrandPython,
  IconBrandReact,
  IconCode,
  IconServer,
  IconBrandTypescript,
  IconBrandPhp,
  IconBrandRust,
  IconBrandGolang,
} from '@tabler/icons-react';
import { type ComponentType } from 'react';

// ─── Project Types ────────────────────────────────────────
export const PROJECT_TYPES = [
  { value: 'nextjs', label: 'Next.js' },
  { value: 'react', label: 'React' },
  { value: 'node', label: 'Node.js' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'php', label: 'PHP' },
  { value: 'strapi', label: 'Strapi' },
  { value: 'other', label: 'Other' },
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number]['value'];

export const PROJECT_TYPE_ICONS: Record<string, ComponentType<{ size?: number | string }>> = {
  nextjs: IconBrandNextjs,
  react: IconBrandReact,
  node: IconBrandNodejs,
  typescript: IconBrandTypescript,
  python: IconBrandPython,
  rust: IconBrandRust,
  go: IconBrandGolang,
  php: IconBrandPhp,
  strapi: IconServer,
  other: IconCode,
};

// ─── Device OS ────────────────────────────────────────────
export const DEVICE_OS = [
  { value: 'linux', label: 'Linux' },
  { value: 'darwin', label: 'macOS' },
  { value: 'windows', label: 'Windows' },
] as const;

export type DeviceOS = (typeof DEVICE_OS)[number]['value'];

export const DEVICE_OS_ICONS: Record<string, ComponentType<{ size?: number | string }>> = {
  linux: IconServer,
  darwin: IconDeviceDesktop,
  windows: IconDeviceDesktop,
};

// ─── Navigation ───────────────────────────────────────────
export const NAV_ITEMS = [
  { href: '/projects', label: 'Projects', icon: IconFolder },
  { href: '/devices', label: 'Devices', icon: IconDeviceDesktop },
  { href: '/pm2', label: 'PM2', icon: IconCpu },
] as const;
