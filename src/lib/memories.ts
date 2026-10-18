// =============================================================
// v4.52 « LIVRE D'OR VIVANT » + « MIDDLE-STAY CARE » — lib partagée
//
// Types sérialisés + parseurs tolérants (jamais de throw) pour :
//   • GuestMemory — mur de souvenirs (photos/vocaux/messages modérés) ;
//   • MiddleStayRequest — réassort / ménage en cours de séjour.
//
// NB SQLite : photoUrlsJson est une STRING JSON ([{ url }]) — les
// listes scalaires ne sont pas supportées ; les photos sont des
// dataURL (même pipeline que hubPhotos / photos de ménage).
// =============================================================

/** Souvenir tel que vu par les INVITÉS (galerie publique — approuvé
 *  + public uniquement ; jamais d'email ni de bookingId). */
export interface GuestMemoryPublic {
  id: string;
  guestName: string;
  guestCountry: string | null;
  rating: number;
  message: string | null;
  photos: { url: string; caption?: string }[];
  audioUrl: string | null;
  isPinned: boolean;
  hostReply: string | null;
  createdAt: string;
}

/** Souvenir tel que vu par l'HÔTE (modération — tout inclus). */
export interface GuestMemoryHost extends GuestMemoryPublic {
  isPublic: boolean;
  isApproved: boolean;
  bookingId: string | null;
}

/** Parse tolérant du champ photo_urls_json → liste de photos. */
export function parseMemoryPhotos(raw: string): { url: string; caption?: string }[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({
        url: typeof p.url === 'string' ? p.url : '',
        ...(typeof p.caption === 'string' && p.caption ? { caption: p.caption } : {}),
      }))
      .filter((p) => p.url.length > 0);
  } catch {
    return [];
  }
}

/** Plafonds d'upload (dataURL) — garde-fous anti-DB-bloat. */
export const MEMORY_LIMITS = {
  maxPhotos: 5,
  maxPhotoChars: 400_000, // ~400 Ko / photo (JPEG redimensionné client)
  maxAudioChars: 1_500_000, // ~1,1 Mo de vocal (≤ 60 s)
  maxMessageChars: 800,
} as const;

/** Liste de pays pour le dropdown à drapeaux (emoji ISO — zéro image). */
export const MEMORY_COUNTRIES: { label: string; flag: string }[] = [
  { label: 'France', flag: '🇫🇷' },
  { label: 'Belgique', flag: '🇧🇪' },
  { label: 'Suisse', flag: '🇨🇭' },
  { label: 'Canada', flag: '🇨🇦' },
  { label: 'Luxembourg', flag: '🇱🇺' },
  { label: 'Allemagne', flag: '🇩🇪' },
  { label: 'Royaume-Uni', flag: '🇬🇧' },
  { label: 'Irlande', flag: '🇮🇪' },
  { label: 'Espagne', flag: '🇪🇸' },
  { label: 'Italie', flag: '🇮🇹' },
  { label: 'Portugal', flag: '🇵🇹' },
  { label: 'Pays-Bas', flag: '🇳🇱' },
  { label: 'États-Unis', flag: '🇺🇸' },
  { label: 'Brésil', flag: '🇧🇷' },
  { label: 'Mexique', flag: '🇲🇽' },
  { label: 'Argentine', flag: '🇦🇷' },
  { label: 'Maroc', flag: '🇲🇦' },
  { label: 'Algérie', flag: '🇩🇿' },
  { label: 'Tunisie', flag: '🇹🇳' },
  { label: 'Sénégal', flag: '🇸🇳' },
  { label: 'Côte d’Ivoire', flag: '🇨🇮' },
  { label: 'Chine', flag: '🇨🇳' },
  { label: 'Japon', flag: '🇯🇵' },
  { label: 'Corée du Sud', flag: '🇰🇷' },
  { label: 'Inde', flag: '🇮🇳' },
  { label: 'Australie', flag: '🇦🇺' },
  { label: 'Autre / International', flag: '🌍' },
];

/** Drapeau d'un pays (repli 🌍 si inconnu). */
export function countryFlag(label: string | null | undefined): string {
  if (!label) return '🌍';
  const found = MEMORY_COUNTRIES.find((c) => c.label.toLowerCase() === label.toLowerCase());
  return found?.flag ?? '🌍';
}

/** Statuts Middle-Stay (valeurs lowercase de la spec client). */
export const MIDDLE_STAY_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'À traiter', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  in_progress: { label: 'En cours', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  completed: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

/** Demande Middle-Stay sérialisée (hôte). */
export interface MiddleStayRequestHost {
  id: string;
  guestName: string;
  requestType: 'restock' | 'cleaning' | string;
  details: string | null;
  status: 'pending' | 'in_progress' | 'completed' | string;
  assignedTo: string | null;
  price: number | null;
  createdAt: string;
  completedAt: string | null;
}
