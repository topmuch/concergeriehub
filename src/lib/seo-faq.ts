// =============================================================
// SEO v4.77 — FAQ de la landing (source unique).
//
// Utilisée à DEUX endroits qui doivent rester identiques :
//   1. page.tsx → JSON-LD FAQPage (rich results Google)
//   2. src/components/landing/markets-section.tsx → rendu visible
//
// Google exige que le contenu de la FAQPage soit visible par
// l'utilisateur sur la page : une seule source évite toute
// divergence. Les textes FR sont les clés i18n de la landing
// (markets-section les passe dans t() — traductions progressives).
// =============================================================

export interface SeoFaqItem {
  q: string;
  a: string;
}

export const SEO_FAQ: readonly SeoFaqItem[] = [
  {
    q: 'Qu’est-ce qu’un Hub invité RoomScan ?',
    a: 'C’est un espace web ouvert par le scan d’une plaque QR posée dans le logement : Wi-Fi en 1 clic, guidebook numérique, arrivée pas à pas, minibar, bouclier d’avis et boutique de souvenirs. Aucune application à installer pour vos invités.',
  },
  {
    q: 'Comment fonctionne la plaque QR code de la conciergerie ?',
    a: 'Une plaque élégante est posée dans le logement. L’invité la scanne avec l’appareil photo de son téléphone et ouvre immédiatement le hub : connexion Wi-Fi, guide numérique, services et messagerie avec l’hôte.',
  },
  {
    q: 'Est-ce compatible avec Airbnb et Booking.com ?',
    a: 'Oui. Le hub invité s’adresse aux voyageurs Airbnb, Booking.com et de location directe, et le dashboard hôte synchronise les calendriers (iCal), automatise le ménage, les notifications et le départ tardif.',
  },
  {
    q: 'Dans quels pays RoomScan Concierge Hub est-il disponible ?',
    a: 'RoomScan est disponible en Afrique de l’Ouest (Dakar, Sénégal, Abidjan…), en Europe (France, Belgique, Suisse, Luxembourg, Espagne) et au Canada (Montréal, Québec, Toronto…). L’interface et le guide sont disponibles en 8 langues.',
  },
  {
    q: 'Combien coûte RoomScan Concierge Hub ?',
    a: 'L’offre Solo démarre à 9,90 € par mois pour un logement ; l’offre Pro est à 199 € par an pour jusqu’à 3 logements (white-label, équipe multi-rôles, API). Essai gratuit de 14 jours, sans engagement.',
  },
  {
    q: 'Mes invités doivent-ils installer une application ?',
    a: 'Non. Le house manual digital et tous les modules s’ouvrent dans le navigateur du téléphone dès le scan du QR code — iPhone comme Android, sans compte ni téléchargement.',
  },
] as const;
