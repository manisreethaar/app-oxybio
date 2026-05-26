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
