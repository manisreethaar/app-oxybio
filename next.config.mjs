const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // jsdom (used by isomorphic-dompurify) loads default-stylesheet.css via
      // fs.readFileSync with a __dirname-relative path. When Next.js bundles it
      // into a single server chunk that path breaks. Marking it as external
      // keeps it in node_modules at runtime where the path resolves correctly.
      config.externals = [...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)), 'jsdom'];
    }
    return config;
  },
};

export default nextConfig;
