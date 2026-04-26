'use client';

import { createTheme, MantineColorsTuple } from '@mantine/core';

// Custom cyan/teal accent color
const brand: MantineColorsTuple = [
  '#e6fcff',
  '#c4f1f9',
  '#93e6f0',
  '#5fd9e8',
  '#38cfe1',
  '#22c8db',
  '#0dc5d9',
  '#00adc0',
  '#009aab',
  '#008594',
];

export const theme = createTheme({
  primaryColor: 'brand',
  colors: {
    brand,
    dark: [
      '#d5d7e0', // 0 — primary text (brighter)
      '#acaebf', // 1 — secondary text (much brighter)
      '#8c8fa3', // 2 — muted text (visible now)
      '#666980', // 3 — subtle text / borders
      '#4d4f66', // 4 — card borders (visible)
      '#34354a', // 5 — input borders / dividers
      '#2b2c3d', // 6 — card background / hover
      '#1d1e30', // 7 — surface background
      '#141521', // 8 — sidebar / secondary bg
      '#0c0d1a', // 9 — main background
    ],
  },
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    fontWeight: '700',
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    Button: {
      defaultProps: {
        variant: 'filled',
      },
    },
    Card: {
      defaultProps: {
        padding: 'lg',
        radius: 'md',
        withBorder: true,
      },
      styles: {
        root: {
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-4)',
        },
      },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
        overlayProps: {
          backgroundOpacity: 0.55,
          blur: 3,
        },
      },
    },
    Notification: {
      defaultProps: {
        radius: 'md',
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor: 'var(--mantine-color-dark-6)',
          borderColor: 'var(--mantine-color-dark-4)',
        },
      },
    },
    PasswordInput: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor: 'var(--mantine-color-dark-6)',
          borderColor: 'var(--mantine-color-dark-4)',
        },
      },
    },
    Select: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor: 'var(--mantine-color-dark-6)',
          borderColor: 'var(--mantine-color-dark-4)',
        },
      },
    },
    Textarea: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor: 'var(--mantine-color-dark-6)',
          borderColor: 'var(--mantine-color-dark-4)',
        },
      },
    },
    TagsInput: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor: 'var(--mantine-color-dark-6)',
          borderColor: 'var(--mantine-color-dark-4)',
        },
      },
    },
    Badge: {
      defaultProps: {
        variant: 'light',
        radius: 'sm',
      },
    },
    NavLink: {
      styles: {
        label: {
          color: 'var(--mantine-color-dark-0)',
        },
      },
    },
    Divider: {
      defaultProps: {
        color: 'dark.4',
      },
    },
  },
});
