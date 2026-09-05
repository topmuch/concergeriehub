import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

// =============================================================
// SEO — sitemap.xml dynamique
//
// Seules les pages publiques marketing y figurent. Les Hubs invités
// (/hub/[slug]) sont volontairement exclus : ils sont destinés au
// scan de la plaque QR, pas au référencement (et ne doivent pas
// exposer SSID/guidebook aux moteurs).
// =============================================================

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
