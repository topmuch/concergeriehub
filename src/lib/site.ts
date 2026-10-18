// =============================================================
// SEO — URL canonique & identité du site
//
// Source unique pour metadataBase (layout), sitemap.xml, robots.txt
// et le JSON-LD de la landing. Réutilise la convention env déjà en
// place dans le middleware (NEXT_PUBLIC_APP_URL || NEXTAUTH_URL).
//
// v4.69 — FIX « liens localhost dans les emails » : le fallback
// absolu est désormais le domaine de production https://roomscan.pro.
// Avant : si NEXT_PUBLIC_APP_URL / NEXTAUTH_URL manquaient au runtime
// (déploiement Coolify sans variable), les emails d'invitation,
// reset password et CTA contenaient http://localhost:3000.
// En dev local, NEXTAUTH_URL=http://localhost:3000 reste prioritaire
// (il est défini dans .env) — seules les env absentes retombent sur
// le domaine de production.
// =============================================================

/** Fallback absolu = domaine de production (jamais localhost). */
const DEFAULT_SITE_URL = 'https://roomscan.pro';

/** URL canonique sans slash final (ex: https://roomscan.pro). */
export const siteUrl = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  DEFAULT_SITE_URL
).replace(/\/+$/, '');

/**
 * v4.69 — Origine absolue pour les URLs Stripe success/cancel et tout
 * lien construit côté serveur à partir d'une requête : priorité au
 * header `Origin` (le vrai domaine du navigateur), sinon `siteUrl`
 * (qui ne peut plus tomber sur localhost).
 */
export function resolveOrigin(req: Request): string {
  const origin = req.headers.get('origin');
  if (origin && /^https?:\/\//i.test(origin)) {
    return origin.replace(/\/+$/, '');
  }
  return siteUrl;
}

/** Nom public de la plateforme (og:site_name, JSON-LD, emails). */
export const siteName = 'RoomScan';
