// =============================================================
// concierge-media — helpers partagés PHOTOS DE LA CONCIERGERIE
// (appareils du guide + pannes courantes du SOS)
//
// Même logique que voice-audio : les fichiers sont écrits dans
// <cwd>/data/uploads/concierge (volume persistant Docker /app/data,
// avec la base) et lus via la route API /api/uploads/concierge/<fichier>.
// Écrire dans public/ ne fonctionne PAS en build standalone (Next.js
// ne sert pas les fichiers ajoutés après le build) et le volume ne
// persisterait pas les redéploiements.
// =============================================================

/** Extensions images autorisées (allowlist serveur). */
export const CONCIERGE_MEDIA_EXT = ['webp', 'png', 'jpg', 'jpeg', 'gif'] as const;
export type ConciergeMediaExt = (typeof CONCIERGE_MEDIA_EXT)[number];

/** Content-Type servi par la route de lecture, par extension. */
export const CONCIERGE_MEDIA_CONTENT_TYPES: Record<ConciergeMediaExt, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
};
