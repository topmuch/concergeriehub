import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // AUD-FULL/FIX-6 : le type-checking participe au build (0 erreur tsc prouvée).
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  serverExternalPackages: ['canvas', 'qrcode', 'qr-code-styling', 'bcryptjs'],
  // AUD-FULL/FIX-7 — Security headers (CSP volontairement absent : Next inline
  // scripts + Turbopack + Stripe.js + tuiles Leaflet exigent un tuning dédié,
  // à traiter en passe séparée avec tests de non-régression complets).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // microphone=(self) : requis par les messages vocaux du Hub (même origine)
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=(self)",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
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
