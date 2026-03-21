import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  cacheStartUrl: false,
  dynamicStartUrl: false
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withPWA(nextConfig);
