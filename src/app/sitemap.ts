import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

// =============================================================
// SEO — sitemap.xml dynamique
//
// Seules les pages publiques marketing y figurent. Les Hubs invités
// (/hub/[slug]) sont volontairement exclus : ils sont destinés au
// scan de la plaque QR, pas au référencement (et ne doivent pas
// exposer SSID/guidebook aux moteurs).
//
// v4.77 — couverture complète des routes PUBLIQUES réelles de
// src/app (vérifiées) : / (landing) et /legal (mentions légales,
// CGU, confidentialité — une seule page avec ancres). Les routes
// /forgot-password, /reset-password, /activate/[token], /setup
// sont des utilitaires sans valeur SEO (et souvent liés à une
// session/token) : elles restent crawlables mais hors sitemap.
// /admin, /airbnb, /api, /provider, /app, /view sont déjà
// interdits côté robots.ts.
// =============================================================

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/legal`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
