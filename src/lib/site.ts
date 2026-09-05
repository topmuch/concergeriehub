// =============================================================
// SEO — URL canonique & identité du site
//
// Source unique pour metadataBase (layout), sitemap.xml, robots.txt
// et le JSON-LD de la landing. Réutilise la convention env déjà en
// place dans le middleware (NEXT_PUBLIC_APP_URL || NEXTAUTH_URL),
// avec fallback dev local.
// =============================================================

/** URL canonique sans slash final (ex: https://conciergeriehub.fr). */
export const siteUrl = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'http://localhost:3000'
).replace(/\/+$/, '');

/** Nom public de la plateforme (og:site_name, JSON-LD, emails). */
export const siteName = 'Conciergerie Hub';
