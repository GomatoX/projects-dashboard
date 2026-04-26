import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dev Dashboard',
    short_name: 'DevDash',
    description:
      'Multi-device development dashboard for managing projects, deployments, and AI workflows',
    start_url: '/',
    display: 'standalone',
    background_color: '#141417',
    theme_color: '#0dc5d9',
    orientation: 'any',
    categories: ['developer', 'productivity', 'utilities'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
