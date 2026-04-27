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
  // Brand naudoja gilesnį atspalvį šviesoje temoje (WCAG AA kontrastui),
  // o tamsoje lieka ryškus #0dc5d9.
  primaryShade: { light: 8, dark: 6 },
  // Automatiškai parenka baltą/juodą tekstą filled spalvoms pagal kontrastą.
  autoContrast: true,
  colors: {
    brand,
    // Brand-tinted dark palette — naudojama tamsoje temoje.
    // Light temoje šie kintamieji yra perrašomi į gray skalę globals.css faile,
    // kad esamos `var(--mantine-color-dark-X)` referencijos veiktų abiejose temose.
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
          backgroundColor:
            'light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))',
          borderColor:
            'light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
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
          backgroundColor:
            'light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))',
          borderColor:
            'light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
        },
      },
    },
    PasswordInput: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor:
            'light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))',
          borderColor:
            'light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
        },
      },
    },
    Select: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor:
            'light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))',
          borderColor:
            'light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
        },
      },
    },
    Textarea: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor:
            'light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))',
          borderColor:
            'light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
        },
      },
    },
    TagsInput: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor:
            'light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))',
          borderColor:
            'light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
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
          color:
            'light-dark(var(--mantine-color-gray-9), var(--mantine-color-dark-0))',
        },
      },
    },
    Divider: {
      defaultProps: {
        color: 'gray.3',
      },
    },
  },
});
