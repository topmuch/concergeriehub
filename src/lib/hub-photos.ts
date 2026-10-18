// =============================================================
// v4.31 « PHOTOS DE MON HUB » — personnalisation hôte
// -------------------------------------------------------------
// Chaque carte photo pleine carte de l'Espace Invité (/hub/[slug])
// peut être remplacée par la VRAIE photo du bien, uploadée par
// l'hôte depuis le Mode Hôte (« 📸 Photos de mon hub »).
//
// Stockage : Property.hubPhotos (Json) — { [cardKey]: dataURL }.
//  - dataURL image/jpeg redimensionné côté client (max 1280 px,
//    qualité 0.82, ≈ 100–250 Ko) → pas de fichier sur disque,
//    compatible déploiements container (pas de volume) ;
//  - CSP img-src inclut `data:` → rendu direct ;
//  - clé absente (ou valeur null envoyée par l'hôte) = photo
//    curated d'illustration (src/lib/hub-visuals.ts).
//
// Ce module est SANS dépendance serveur : importable par les
// routes API ET les composants client.
// =============================================================

/** Clés autorisées du mapping hubPhotos (allowlist serveur + UI hôte). */
export const HUB_PHOTO_KEYS = [
  /** Grande photo du hero « 👤 Espace Invité ». */
  'hero',
  /** Flagship 🥐 Services & Expériences (au-dessus des vignettes). */
  'services',
  /** 🔑 Accès & Codes. */
  'access',
  /** 🗺️ Arrivée pas à pas (guide visuel). */
  'arrival',
  /** 📖 Guidebook. */
  'guidebook',
  /** 🛠️ Guide des appareils. */
  'appliances',
  /** 🧰 Kit de survie. */
  'survival',
  /** 🎬 Vidéo de bienvenue. */
  'video',
  /** ⏱️ Départ tardif. */
  'lateCheckout',
  /** 📍 Bonnes adresses (carte secrète). */
  'spots',
  /** ⭐ Bouclier d'avis. */
  'review',
  /** 🆘 SOS & Urgences. */
  'sos',
  /** 📞 Contacter l'hôte. */
  'host',
  /** v4.33 🛍️ Shop the Stay (boutique de la maison). */
  'shop',
  /** v4.74 🛍️ Boutique de souvenirs (produits artisanaux du séjour). */
  'souvenirs',
] as const;

export type HubPhotoKey = (typeof HUB_PHOTO_KEYS)[number];

/** Mapping complet autorisé : clé → dataURL (ou clé absente = curated). */
export type HubPhotoMap = Partial<Record<HubPhotoKey, string>>;

/** Plafond de sécurité par photo (dataURL base64) — même ordre de
 *  grandeur que les photos de réclamation (500 Ko). */
export const MAX_HUB_PHOTO_CHARS = 500_000;

/** Garde-fou type : la clé fait partie de l'allowlist. */
export function isHubPhotoKey(key: string): key is HubPhotoKey {
  return (HUB_PHOTO_KEYS as readonly string[]).includes(key);
}

/** Parse tolérant du champ Json brut (jamais de throw — parité avec
 *  les autres parseurs du payload invité). Valeurs non conformes
 *  (préfixe, taille) ignorées silencieusement. */
export function parseHubPhotos(raw: unknown): HubPhotoMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: HubPhotoMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isHubPhotoKey(key)) continue;
    if (typeof value !== 'string') continue;
    if (!value.startsWith('data:image/')) continue;
    if (value.length > MAX_HUB_PHOTO_CHARS) continue;
    out[key] = value;
  }
  return out;
}

/** Slots proposés à l'hôte dans le dialog « Photos de mon hub »
 *  (ordre d'affichage : hero d'abord, puis ordre de la page). */
export const HUB_PHOTO_SLOTS: {
  key: HubPhotoKey;
  label: string;
  emoji: string;
  hint: string;
}[] = [
  { key: 'hero', label: 'Photo de couverture', emoji: '🏡', hint: 'La grande photo en haut de l’Espace Invité' },
  { key: 'services', label: 'Room Services & Expériences', emoji: '🥐', hint: 'La carte flagship des commandes' },
  { key: 'access', label: 'Accès & Codes', emoji: '🔑', hint: 'Serrure, portail, boîte à clés…' },
  { key: 'arrival', label: 'Arrivée pas à pas', emoji: '🗺️', hint: 'La façade ou l’entrée du bâtiment' },
  { key: 'guidebook', label: 'Guidebook', emoji: '📖', hint: 'Un bel intérieur du logement' },
  { key: 'appliances', label: 'Guide des appareils', emoji: '🛠️', hint: 'Machine à café, cuisine, sono…' },
  { key: 'survival', label: 'Kit de survie', emoji: '🧰', hint: 'L’entrée, un placard bien rangé' },
  { key: 'video', label: 'Vidéo de bienvenue', emoji: '🎬', hint: 'Le salon ou une chambre' },
  { key: 'lateCheckout', label: 'Départ tardif', emoji: '⏱️', hint: 'La chambre, un lit frais' },
  { key: 'spots', label: 'Visiter la ville', emoji: '🗺️', hint: 'Un café, un musée du quartier' },
  { key: 'review', label: 'Bouclier d’avis', emoji: '⭐', hint: 'Un coin chaleureux du séjour' },
  { key: 'sos', label: 'SOS & Urgences', emoji: '🆘', hint: 'Extincteur, trousse de secours…' },
  { key: 'host', label: 'Contacter l’hôte', emoji: '📞', hint: 'Une cloche, un téléphone, un mot d’accueil' },
  { key: 'shop', label: 'Shop the Stay', emoji: '🛍️', hint: 'Les produits de la maison à vendre' },
];

/** Redimensionne une image choisie par l'hôte en dataURL JPEG compact
 *  (max 1280 px de large, qualité 0.82). Doit être appelé côté client.
 *  Retourne null si le navigateur ne peut pas traiter le fichier. */
export async function fileToHubPhotoDataUrl(file: File, maxW = 1280): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxW / Math.max(bitmap.width, 1));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}
