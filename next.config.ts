import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ['canvas', 'qrcode', 'qr-code-styling', 'bcryptjs'],
  // HOST-5 — Migration de la structure du Dashboard Client :
  // les anciennes routes /airbnb/dashboard/* redirigent vers la
  // nouvelle arborescence (/airbnb/properties, /plates, /orders,
  // /providers, /settings, /automations). permanent: false (308
  // réversible le temps de la transition des bookmarks/emails).
  async redirects() {
    return [
      { source: '/airbnb/dashboard/portfolio', destination: '/airbnb/properties', permanent: false },
      { source: '/airbnb/dashboard/plaques', destination: '/airbnb/plates', permanent: false },
      { source: '/airbnb/dashboard/plaques/:path*', destination: '/airbnb/plates/:path*', permanent: false },
      { source: '/airbnb/dashboard/orders', destination: '/airbnb/orders', permanent: false },
      { source: '/airbnb/dashboard/providers', destination: '/airbnb/providers', permanent: false },
      { source: '/airbnb/dashboard/branding', destination: '/airbnb/settings', permanent: false },
      { source: '/airbnb/dashboard/automations', destination: '/airbnb/automations', permanent: false },
    ];
  },
};

export default nextConfig;
