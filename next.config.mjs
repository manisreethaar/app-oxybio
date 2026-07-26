const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Keep heavy server-only packages out of the webpack bundle so they are
  // required at runtime from node_modules — prevents "Cannot find module" and
  // canvas/fontkit crashes on Vercel serverless.
  experimental: {
    serverComponentsExternalPackages: [
      '@react-pdf/renderer',
      '@react-pdf/font',
      'canvas',
      'jsdom',
    ],
    // Almost every route in this app is dynamically rendered (auth reads
    // cookies/headers on every request), which by default means the
    // client-side Router Cache treats every navigation as a cold fetch —
    // even re-visiting a module you were just on seconds ago. Explicitly
    // giving dynamic routes a stale window lets Next.js reuse the
    // already-rendered page (and any client component state/subscriptions
    // still attached to it) instead of re-fetching, so switching back to a
    // recently-visited module is instant instead of a full reload.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        'jsdom',
        '@react-pdf/renderer',
        '@react-pdf/font',
        'canvas',
      ];
    }
    return config;
  },
};

export default nextConfig;
