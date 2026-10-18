// =============================================================
// v4.109 « ANIMATION PRÉ-ARRIVÉE » — FENÊTRE D'OUVERTURE DU HUB
//
// SOURCE UNIQUE DE VÉRITÉ (module PUR, importable côté client ET
// serveur — ne JAMAIS y importer @/lib/db ou un module serveur).
//
// Le hub verrouillé ne devient openable (pavé de saisie du code
// actif) que HUB_ACCESS_WINDOW_HOURS avant l'arrivée du séjour.
// Avant ce seuil, l'écran de verrouillage affiche l'animation
// d'accueil (components/hub-premium/hub-arrival-teaser.tsx) — plus
// jamais un pavé dont le code serait refusé. Utilisé par :
//   • /api/public/hub/[slug]/access (validation serveur du code) ;
//   • /api/public/hub/[slug] (exposition du prochain check-in) ;
//   • le composant teaser (compte à rebours + bascule automatique).
// v4.109 — la fenêtre passe de 4 h à 2 h (spécification client :
// « animation jusqu'à 2 h avant l'arrivée de l'invité »).
// =============================================================

/** Heures avant l'arrivée où le hub s'ouvre (pavé + code acceptés). */
export const HUB_ACCESS_WINDOW_HOURS = 2;

/** Instant d'ouverture du hub pour un check-in donné. */
export function hubWindowOpensAt(checkIn: Date): Date {
  return new Date(checkIn.getTime() - HUB_ACCESS_WINDOW_HOURS * 3_600_000);
}
