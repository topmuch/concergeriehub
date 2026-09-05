import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

// =============================================================
// SEO — robots.txt dynamique
//
// Remplace l'ancien public/robots.txt statique (qui autorisait tout)
// : les zones applicatives privées sont exclues, le sitemap et le
// host canoniques sont déclarés avec l'URL d'environnement.
// =============================================================

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',     // console superadmin
          '/airbnb',    // dashboards hôtes (session requise)
          '/api',       // endpoints
          '/setup',     // installation
          '/activate',  // activation de compte par token
          '/provider',  // espace prestataires
          '/app',       // routes legacy
          '/view',      // préviews modules legacy
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
