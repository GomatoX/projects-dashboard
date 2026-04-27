import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: ['192.168.1.218'],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
