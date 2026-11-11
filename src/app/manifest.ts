import type { MetadataRoute } from 'next';

// "Add to Home screen" (#71 step 3): opens on Entry, without the browser's bars.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FarGaze Log',
    short_name: 'FarGaze',
    start_url: '/entry',
    scope: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#18181b',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
