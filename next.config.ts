import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ['canvas', 'qrcode', 'qr-code-styling', 'bcryptjs'],
};

export default nextConfig;
