import type { MetadataRoute } from 'next';

// =============================================================
// PWA (Task 42-a) — Manifest Web App « Roomscan Bouclier »
//
// Servi par Next sur /manifest.webmanifest (convention App Router).
// Référencé depuis src/app/layout.tsx (metadata.manifest).
// Les icônes pointent vers les routes dynamiques générées par
// src/app/icon.tsx (generateImageMetadata) : /icon/192 + /icon/512.
// Public visé : agents de ménage (app cleaner) sur mauvaise 4G →
// installation « Ajouter à l'écran d'accueil » + mode hors-ligne.
// =============================================================

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Roomscan Bouclier',
    short_name: 'Roomscan',
    description:
      'Roomscan — interventions de ménage, captures photo/vidéo et vérification des logements, même en mauvaise connexion.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#1e3a8a',
    lang: 'fr',
    categories: ['travel', 'business', 'utilities'],
    icons: [
      {
        src: '/icon/192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
