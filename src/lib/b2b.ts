// =============================================================
// Helpers B2B — Conciergerie Hub
// Métadonnées prestataires (catégories → emoji/label), modules
// du dashboard, distance haversine, formats monétaires.
// (Partagé client + serveur — aucune dépendance DB ici.)
// =============================================================

// -------------------------------------------------------------
// Catégories de prestataires → emoji + libellé français
// -------------------------------------------------------------
export interface ProviderCategoryMeta {
  emoji: string;
  label: string;
}

export const PROVIDER_CATEGORY_META: Record<string, ProviderCategoryMeta> = {
  // --- Services Propriétaire (OWNER_SERVICE) ---
  menage: { emoji: '🧹', label: 'Ménage' },
  plomberie: { emoji: '🔧', label: 'Plomberie' },
  electricite: { emoji: '💡', label: 'Électricité' },
  serrurerie: { emoji: '🔑', label: 'Serrurerie' },
  pressing: { emoji: '👔', label: 'Pressing' },
  jardinage: { emoji: '🌿', label: 'Jardinage' },
  peinture: { emoji: '🎨', label: 'Peinture & retouches' },
  // --- Expériences Invité (GUEST_EXPERIENCE) ---
  petit_dejeuner: { emoji: '🥐', label: 'Petit-déjeuner' },
  sommelier: { emoji: '🍷', label: 'Sommelier' },
  transfert: { emoji: '🚐', label: 'Transferts' },
  chef: { emoji: '👨‍🍳', label: 'Chef à domicile' },
  massage: { emoji: '💆', label: 'Bien-être' },
  visites: { emoji: '🗼', label: 'Visites & expériences' },
  baby_sitting: { emoji: '👶', label: 'Baby-sitting' },
};

/** Fallback si la catégorie n'est pas référencée. */
export function providerCategoryMeta(category: string): ProviderCategoryMeta {
  return PROVIDER_CATEGORY_META[category] ?? { emoji: '🛠️', label: category };
}

// -------------------------------------------------------------
// Audiences prestataires
// -------------------------------------------------------------
export const PROVIDER_AUDIENCES = ['OWNER_SERVICE', 'GUEST_EXPERIENCE'] as const;
export type ProviderAudience = (typeof PROVIDER_AUDIENCES)[number];

export const PROVIDER_AUDIENCE_META: Record<
  ProviderAudience,
  { label: string; emoji: string; hint: string }
> = {
  OWNER_SERVICE: {
    label: 'Services Propriétaire',
    emoji: '🔧',
    hint: 'Ménage, plomberie, pressing… des intervenants pour entretenir votre bien.',
  },
  GUEST_EXPERIENCE: {
    label: 'Expériences Invité',
    emoji: '🥂',
    hint: 'Petit-déjeuner, sommelier, transferts… visibles par vos voyageurs via le QR code.',
  },
};

// -------------------------------------------------------------
// Modules affichés sur le dashboard hôte (5 cartes du spec)
// dbType = valeur du champ QrCode.type en base
// -------------------------------------------------------------
export interface DashboardModuleMeta {
  key: string;
  dbType: string;
  label: string;
  emoji: string;
  description: string;
}

export const DASHBOARD_MODULES: DashboardModuleMeta[] = [
  {
    key: 'WIFI',
    dbType: 'wifi',
    label: 'Wi-Fi & Réseau',
    emoji: '📶',
    description: 'Identifiants et connexion en un scan',
  },
  {
    key: 'GUIDEBOOK',
    dbType: 'home_manual',
    label: 'Guidebook & Règles',
    emoji: '📖',
    description: 'Guide de bienvenue, accès et consignes',
  },
  {
    key: 'UPSELLING',
    dbType: 'promo',
    label: 'Upselling & Services',
    emoji: '💰',
    description: 'Morning Box, ménage, expériences payantes',
  },
  {
    key: 'COMPLAINT',
    dbType: 'contact',
    label: 'Réclamations & Service Client',
    emoji: '🚨',
    description: 'Canal direct voyageur → hôte',
  },
  {
    key: 'PROVIDER_DIRECTORY',
    dbType: 'artisan_directory',
    label: 'Prestataires',
    emoji: '🧹',
    description: 'Ménage, plomberie et expériences autour du bien',
  },
];

// -------------------------------------------------------------
// Types de bien → emoji
// -------------------------------------------------------------
export const PROPERTY_TYPE_META: Record<string, { emoji: string; label: string }> = {
  AIRBNB: { emoji: '🏠', label: 'Airbnb' },
  BOOKING: { emoji: '🛏️', label: 'Booking.com' },
  GITE: { emoji: '🏡', label: 'Gîte' },
  CHAMBRE_HOTE: { emoji: '🛎️', label: 'Chambre d’hôtes' },
};

export function propertyTypeMeta(type: string): { emoji: string; label: string } {
  return PROPERTY_TYPE_META[type] ?? { emoji: '🏠', label: type };
}

// -------------------------------------------------------------
// Géolocalisation — distance haversine (km) entre 2 points
// -------------------------------------------------------------
const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Étendue (en degrés) d'une bounding box autour d'un point pour un
 * rayon donné — pré-filtre SQL avant le calcul haversine précis.
 */
export function boundingBoxDegrees(lat: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
  return { dLat, dLng };
}

// -------------------------------------------------------------
// Formats
// -------------------------------------------------------------
export function formatEur(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}
