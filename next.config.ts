import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ── v4.97 « BUILD SOUS CONTRAINTE MÉMOIRE » (Coolify) ─────────────────
  // Le build v4.96 (turbopack) était tué par l'OOM killer (exit 137) sur le
  // serveur : le live set Turbopack + le type-checker simultanés dépassaient
  // la RAM disponible. Réponse :
  //   1. build → webpack (opt-out officiel Next 16, « --webpack » dans
  //      scripts/build.sh) : profil mémoire borné (pic mesuré ≈ 1,9 Go) ;
  //   2. cpus: 1 → un seul worker de collecte de pages / génération statique
  //      (179 pages générées en 2,2 s : aucun impact de durée) ;
  //   3. webpackMemoryOptimizations → compilateur allégé ;
  //   4. ignoreBuildErrors: true NE SUPPRIME PAS la garantie de types :
  //      `npx tsc --noEmit` est exécuté AVANT `next build` dans
  //      scripts/build.sh (séquentiel → pics mémoire jamais cumulés).
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    cpus: 1,
    webpackMemoryOptimizations: true,
    // v4.101 — webpack tourne DANS le process principal (pas de worker
    // séparé) : une seule heap au lieu de parent+worker. Le serveur de
    // build Coolify est saturé (tous les builds OOM depuis le 16/10,
    // y compris un tar v4.98 reconstruit à l'identique) → il faut
    // réduire le pic mémoire total du build.
    webpackBuildWorker: false,
  },
  // v5.0 — pdfkit externalisé (génération server-side des PDF d'état des lieux).
  serverExternalPackages: ['canvas', 'qrcode', 'qr-code-styling', 'bcryptjs', 'pdfkit'],
  // v4.112 — « edge-tts » est distribué en TypeScript BRUT (main: index.ts,
  // voix neuronale Microsoft Denise fr-FR-DeniseNeural du TTS premium) :
  // Node ne peut pas require du TS à runtime (serverExternalPackages est
  // donc EXCLU) — il DOIT être transpilé dans le bundle serveur.
  transpilePackages: ['edge-tts'],
  // v4.103 — FIX PDF PROD « Impossible de générer le PDF » : pdfkit lit ses
  // polices standard (Helvetica, Times…) avec des chemins DYNAMIQUES que le
  // tracing NFT du build standalone ne copie PAS :
  //   • js/data/*.afm (métadonnées AFM, lues par fs.readFileSync) ;
  //   • js/standard-fonts/*.cjs (require dynamique via l'imports map
  //     « #standard-fonts/Helvetica » — v4.104 : c'était LE module absent
  //     en prod, preuve par docker exec : « Cannot find module
  //     …/pdfkit/js/standard-fonts/Helvetica.cjs »).
  // Fix officiel Next.js : inclure explicitement js/ en entier (~1,5 Mo)
  // — couvre data + standard-fonts + futurs changements de structure,
  // pour TOUTES les routes PDF (inspection, checkout-report,
  // cleaning-report, commission-invoice, insurance).
  outputFileTracingIncludes: {
    '/**': ['./node_modules/pdfkit/js/**'],
  },
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
