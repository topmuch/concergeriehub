// =============================================================
// DIGITAL CONCIERGE (V4.1) — Helpers des modules enrichis du Hub
// Invité. Source de vérité des formes JSON de Property :
//   accessCodes   → coffre-fort numérique (onglet/objet)
//   appliances    → guide des appareils (onglet Guide)
//   localSpots    → carte secrète de l'hôte (onglet Quartier)
//   emergencyInfo → SOS + pannes courantes (onglet Urgence)
// Parseurs tolérants (jamais de throw) — miroir du pattern
// parseBranding (src/lib/branding.ts). Importable partout.
// =============================================================

// ── 1. Coffre-fort numérique (accessCodes) ──────────────────
export interface GuestAccessCodes {
  /** Bâtiment / porte d'entrée. */
  building?: string;
  /** Boîte aux lettres. */
  letterbox?: string;
  /** Parking (place, code, niveau…). */
  parking?: string;
  /** Centrale d'alarme. */
  alarm?: string;
  /** Coffre-fort dans le logement. */
  safe?: string;
  /** Note libre de l'hôte (contexte, rotation de code…). */
  note?: string;
}

const CODE_LABELS: { key: keyof Omit<GuestAccessCodes, 'note'>; emoji: string; label: string }[] = [
  { key: 'building', emoji: '🏢', label: 'Bâtiment / Entrée' },
  { key: 'letterbox', emoji: '📮', label: 'Boîte aux lettres' },
  { key: 'parking', emoji: '🚗', label: 'Parking' },
  { key: 'alarm', emoji: '🚨', label: 'Alarme' },
  { key: 'safe', emoji: '🔐', label: 'Coffre-fort' },
];

export function accessCodeRows(codes: GuestAccessCodes): { emoji: string; label: string; value: string }[] {
  return CODE_LABELS.filter((c) => typeof codes[c.key] === 'string' && codes[c.key]!.trim())
    .map((c) => ({ emoji: c.emoji, label: c.label, value: codes[c.key]!.trim() }));
}

function cleanCode(v: unknown): string | undefined {
  return cleanText(v, 40);
}

/** Texte libre tronqué (jamais de throw). */
function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, max);
  return s ? s : undefined;
}

export function parseAccessCodes(raw: unknown): GuestAccessCodes | null {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const parsed: GuestAccessCodes = {
    building: cleanCode(obj.building),
    letterbox: cleanCode(obj.letterbox),
    parking: cleanCode(obj.parking),
    alarm: cleanCode(obj.alarm),
    safe: cleanCode(obj.safe),
    // Note libre → 280 caractères (comme les messages de branding)
    note: cleanText(obj.note, 280),
  };
  const hasAny = Object.values(parsed).some((v) => typeof v === 'string');
  return hasAny ? parsed : null;
}

// ── 2. Guide des appareils (appliances) ─────────────────────
export interface GuestAppliance {
  id: string;
  name: string;
  emoji?: string;
  instructions: string;
  /** Lien YouTube (ouvre l'app/site) OU vidéo mp4 hébergée sur l'app (/uploads/...). */
  videoUrl?: string;
  /** Photo / GIF hébergé sur l'app (/uploads/...) ou data-URL. */
  imageUrl?: string;
}

export function parseAppliances(raw: unknown): GuestAppliance[] {
  if (!Array.isArray(raw)) return [];
  const out: GuestAppliance[] = [];
  for (const item of raw.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
    const instructions = typeof o.instructions === 'string' ? o.instructions.trim().slice(0, 4000) : '';
    if (!name || !instructions) continue;
    out.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 60) : `app-${out.length + 1}`,
      name,
      emoji: typeof o.emoji === 'string' && o.emoji.trim() ? o.emoji.trim().slice(0, 4) : '🛠️',
      instructions,
      videoUrl: typeof o.videoUrl === 'string' && /^https?:\/\/|^\//.test(o.videoUrl.trim()) ? o.videoUrl.trim().slice(0, 500) : undefined,
      imageUrl: typeof o.imageUrl === 'string' && /^(https?:\/\/|\/|data:image\/)/.test(o.imageUrl.trim()) ? o.imageUrl.trim().slice(0, 500) : undefined,
    });
  }
  return out;
}

// ── 3. Carte secrète de l'hôte (localSpots) ─────────────────
// v4.49 « VISITER LA VILLE » — catégories étendues au-delà du quotidien
// (culture, nature, famille, shopping) pour de vraies recommandations
// de voyage. Les anciennes données ('food'…) restent 100 % valides.
export type GuestSpotCategory =
  | 'food'
  | 'bars'
  | 'groceries'
  | 'sport'
  | 'culture'
  | 'nature'
  | 'family'
  | 'shopping';

export interface GuestSpot {
  id: string;
  name: string;
  category: GuestSpotCategory;
  lat: number;
  lng: number;
  address?: string;
  /** Note perso de l'hôte ("Mon coup de cœur !"). */
  hostNote?: string;
}

export const SPOT_CATEGORY_META: Record<GuestSpotCategory, { emoji: string; label: string }> = {
  food: { emoji: '🍔', label: 'Food' },
  bars: { emoji: '🍹', label: 'Bars' },
  groceries: { emoji: '🛒', label: 'Courses' },
  sport: { emoji: '🏃', label: 'Sport' },
  culture: { emoji: '🏛️', label: 'Culture' },
  nature: { emoji: '🌿', label: 'Nature' },
  family: { emoji: '👨‍👩‍👧', label: 'Famille' },
  shopping: { emoji: '🛍️', label: 'Shopping' },
};

/** v4.49 « VISITER LA VILLE » — distance à vol d'oiseau (Haversine, km)
 *  entre le logement et un lieu : affichée sur les cartes du hub invité. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function spotCategoryMeta(category: string): { emoji: string; label: string } {
  return SPOT_CATEGORY_META[category as GuestSpotCategory] ?? { emoji: '📍', label: 'Adresses' };
}

function cleanCoord(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function parseLocalSpots(raw: unknown): GuestSpot[] {
  if (!Array.isArray(raw)) return [];
  const out: GuestSpot[] = [];
  for (const item of raw.slice(0, 60)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
    const lat = cleanCoord(o.lat);
    const lng = cleanCoord(o.lng);
    if (!name || lat === null || lng === null) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const category =
      typeof o.category === 'string' && o.category in SPOT_CATEGORY_META
        ? (o.category as GuestSpotCategory)
        : 'food';
    out.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 60) : `spot-${out.length + 1}`,
      name,
      category,
      lat,
      lng,
      address: typeof o.address === 'string' && o.address.trim() ? o.address.trim().slice(0, 160) : undefined,
      hostNote: typeof o.hostNote === 'string' && o.hostNote.trim() ? o.hostNote.trim().slice(0, 280) : undefined,
    });
  }
  return out;
}

// ── 4. SOS (emergencyInfo) ──────────────────────────────────
export interface GuestCommonIssue {
  id: string;
  title: string;
  instructions: string;
  imageUrl?: string;
}

export interface GuestEmergencyInfo {
  /** Hôpital le plus proche (nom). */
  hospital?: string;
  hospitalLat?: number;
  hospitalLng?: number;
  /** Pharmacie de garde (nom). */
  pharmacy?: string;
  pharmacyPhone?: string;
  /** Police/secours local — défaut "17". */
  police?: string;
  /** Téléphone urgence logement (prioritaire sur le contact standard). */
  hostPhone?: string;
  /** AUDIT PRÉ-PROD — email de contact DÉDIÉ aux invités (ne jamais
   *  exposer l'email de LOGIN du compte hôte — anti-phishing). */
  hostEmail?: string;
  /** Pannes courantes avec instructions. */
  commonIssues: GuestCommonIssue[];
  /** v4.41 « SIGNALEMENT DE CASSE » — lien produit de remplacement
   *  (Amazon, Castorama, fournisseur local…) proposé à l'invité après
   *  un signalement de casse, pour racheter exactement le même modèle
   *  en 1 clic. Configuré par l'hôte (Conciergerie → SOS). */
  breakageShopUrl?: string;
}

export function parseEmergencyInfo(raw: unknown): GuestEmergencyInfo | null {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const commonIssues: GuestCommonIssue[] = [];
  if (Array.isArray(obj.commonIssues)) {
    for (const item of (obj.commonIssues as unknown[]).slice(0, 12)) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const title = typeof o.title === 'string' ? o.title.trim().slice(0, 80) : '';
      const instructions = typeof o.instructions === 'string' ? o.instructions.trim().slice(0, 4000) : '';
      if (!title || !instructions) continue;
      commonIssues.push({
        id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 60) : `issue-${commonIssues.length + 1}`,
        title,
        instructions,
        imageUrl: typeof o.imageUrl === 'string' && /^(https?:\/\/|\/|data:image\/)/.test(o.imageUrl.trim()) ? o.imageUrl.trim().slice(0, 500) : undefined,
      });
    }
  }

  const parsed: GuestEmergencyInfo = {
    hospital: cleanText(obj.hospital, 120),
    hospitalLat: cleanCoord(obj.hospitalLat) ?? undefined,
    hospitalLng: cleanCoord(obj.hospitalLng) ?? undefined,
    pharmacy: cleanText(obj.pharmacy, 120),
    pharmacyPhone: cleanCode(obj.pharmacyPhone),
    police: cleanCode(obj.police),
    hostPhone: cleanCode(obj.hostPhone),
    hostEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanText(obj.hostEmail, 120) ?? '')
      ? cleanText(obj.hostEmail, 120)
      : undefined,
    // v4.41 — lien produit de remplacement (casse) : https uniquement.
    breakageShopUrl:
      typeof obj.breakageShopUrl === 'string' && /^https:\/\/\S+$/.test(obj.breakageShopUrl.trim())
        ? obj.breakageShopUrl.trim().slice(0, 400)
        : undefined,
    commonIssues,
  };

  const hasAny =
    Boolean(
      parsed.hospital ||
        parsed.pharmacy ||
        parsed.police ||
        parsed.hostPhone ||
        parsed.hostEmail ||
        parsed.breakageShopUrl,
    ) ||
    parsed.commonIssues.length > 0;
  return hasAny ? parsed : null;
}

// ── 5. Lien « 📍 Y aller » universel ────────────────────────
/** Apple Maps sur iOS (et Mac), Google Maps ailleurs — ouvre l'app native. */
export function geoDirectionsUrl(lat: number, lng: number): string {
  if (typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)) {
    return `https://maps.apple.com/?q=${lat},${lng}&dirflg=w`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** YouTube ? → bouton lien (la CSP bloque les iframes externes, choix sécurité assumé). */
export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/.test(url);
}

/** Média affichable en local (CSP 'self'/data:) — sinon on proposera un lien. */
export function isLocalMediaUrl(url: string): boolean {
  return url.startsWith('/') || url.startsWith('data:');
}

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — modules premium du
// Hub Invité : vidéo de bienvenue, guide visuel pas à pas, upselling
// late check-out, bouclier d'avis, kit de survie.
// =============================================================

// ── 6. Features premium (premiumFeatures) ───────────────────
export interface GuestPremiumFeatures {
  /** Vidéo de bienvenue : lien YouTube/Vimeo/Loom OU vidéo locale (/uploads/…). */
  videoWelcomeUrl?: string;
  /** Late Check-out payant activé. */
  enableLateCheckout?: boolean;
  /** Prix du late check-out en € (0 < prix ≤ 1000). */
  lateCheckoutPrice?: number;
  /** Bouclier d'avis (Review Shield) activé. */
  enableReviewShield?: boolean;
  /** Lien de l'annonce (avis Airbnb/Booking) proposé aux invités ravis. */
  reviewUrl?: string;
  /** v4.35 « RÉSERVATION DIRECTE » — lien de réservation directe de
   *  l'hôte (site perso, calendrier, WhatsApp…) : le bandeau permanent
   *  du hub convertit les invités Airbnb en clients directs (zéro frais
   *  de plateforme). Sans lien → repli WhatsApp prérempli. */
  directBookingUrl?: string;
  /** Remise annoncée pour la réservation directe (1–90 %, défaut 15). */
  directBookingDiscount?: number;
  /** v4.44 « MINIBAR NUMÉRIQUE » (Honesty Bar) activé. */
  enableMinibar?: boolean;
  /** v4.44 — heure de fin du départ tardif (12–18, défaut 14 —
   *  « prolongez jusqu'à 15 h » configurable par l'hôte). */
  lateCheckoutHour?: number;
  /** v4.50 « VERROUILLAGE DU HUB PAR CODE » — configuration du
   *  verrouillage (écran code + compte à rebours + fin de session 403). */
  hubLock?: GuestHubLock;
  /** v4.54 « ALERTE VOCALE DE DÉPART » — message audio pré-enregistré
   *  par l'hôte (URL publique ou /uploads/…) joué dans la modale de
   *  checklist du check-out. Absent → voix de synthèse (TTS navigateur). */
  checkoutAudioUrl?: string;
}

/** v4.50 — configuration du verrouillage du hub par code d'activation.
 *  Stocké dans premiumFeatures.hubLock = { enabled, checkoutInstructions?,
 *  allowLateRequest? }. Le CODE lui-même vit sur Booking.accessCode
 *  (unique par séjour, jamais exposé dans le payload public). */
export interface GuestHubLock {
  enabled: boolean;
  /** Consignes de départ affichées dans la modal compte à rebours
   *  (où laisser les clés, éteindre la clim…). */
  checkoutInstructions?: string;
  /** Bouton « Demander un départ tardif » dans la modal (défaut true). */
  allowLateRequest?: boolean;
}

/** URL http(s) ou chemin local (/uploads/…) — sinon undefined. */
function cleanUrl(v: unknown, max = 500): string | undefined {
  const s = cleanText(v, max);
  return s && (/^https?:\/\//.test(s) || s.startsWith('/')) ? s : undefined;
}

export function parsePremiumFeatures(raw: unknown): GuestPremiumFeatures | null {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const enableLateCheckout = obj.enableLateCheckout === true;
  const enableReviewShield = obj.enableReviewShield === true;
  const rawPrice = obj.lateCheckoutPrice;
  const lateCheckoutPrice =
    typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice > 0 && rawPrice <= 1000
      ? Math.round(rawPrice * 100) / 100
      : undefined;
  // v4.35 « RÉSERVATION DIRECTE » — remise 1–90 % (défaut 15 côté UI).
  const rawDiscount = obj.directBookingDiscount;
  const directBookingDiscount =
    typeof rawDiscount === 'number' && Number.isFinite(rawDiscount) && rawDiscount >= 1 && rawDiscount <= 90
      ? Math.round(rawDiscount)
      : undefined;
  const directBookingUrl = cleanUrl(obj.directBookingUrl);
  // v4.44 « MINIBAR NUMÉRIQUE » — deux formes acceptées (nouvelle
  // { minibar: { enabled } } et compat { enableMinibar: true }).
  const enableMinibar =
    obj.enableMinibar === true ||
    (obj.minibar as Record<string, unknown> | undefined)?.enabled === true;
  const rawHour = obj.lateCheckoutHour;
  const lateCheckoutHour =
    typeof rawHour === 'number' && Number.isFinite(rawHour) && rawHour >= 12 && rawHour <= 18
      ? Math.round(rawHour)
      : undefined;
  // v4.50 « VERROUILLAGE DU HUB PAR CODE » — { hubLock: { enabled, … } }.
  const rawLock = obj.hubLock as Record<string, unknown> | undefined;
  const hubLockEnabled = rawLock?.enabled === true;
  const hubLockInstructions =
    typeof rawLock?.checkoutInstructions === 'string'
      ? rawLock.checkoutInstructions.trim().slice(0, 600)
      : '';
  const hubLock: GuestHubLock | undefined = hubLockEnabled
    ? {
        enabled: true,
        ...(hubLockInstructions ? { checkoutInstructions: hubLockInstructions } : {}),
        ...(rawLock?.allowLateRequest !== false ? { allowLateRequest: true } : {}),
      }
    : undefined;
  const parsed: GuestPremiumFeatures = {
    videoWelcomeUrl: cleanUrl(obj.videoWelcomeUrl),
    ...(enableLateCheckout
      ? {
          enableLateCheckout: true,
          ...(lateCheckoutPrice !== undefined ? { lateCheckoutPrice } : {}),
          ...(lateCheckoutHour !== undefined ? { lateCheckoutHour } : {}),
        }
      : {}),
    ...(enableReviewShield ? { enableReviewShield: true } : {}),
    reviewUrl: /^https?:\/\//.test(cleanText(obj.reviewUrl, 500) ?? '') ? cleanText(obj.reviewUrl, 500) : undefined,
    ...(directBookingUrl ? { directBookingUrl } : {}),
    ...(directBookingDiscount !== undefined ? { directBookingDiscount } : {}),
    ...(enableMinibar ? { enableMinibar: true } : {}),
    ...(hubLock ? { hubLock } : {}),
    // v4.54 — audio pré-enregistré du rappel de départ (hôte).
    checkoutAudioUrl: cleanUrl(obj.checkoutAudioUrl),
  };
  const hasAny = Boolean(
    parsed.videoWelcomeUrl ||
      parsed.enableLateCheckout ||
      parsed.enableReviewShield ||
      parsed.directBookingUrl ||
      parsed.directBookingDiscount !== undefined ||
      parsed.enableMinibar ||
      parsed.hubLock ||
      parsed.checkoutAudioUrl,
  );
  return hasAny ? parsed : null;
}

// ── 8. v4.33 « SHOP THE STAY » — boutique de la maison ──────
// Demande client : « Les voyageurs adorent parfois la décoration, les
// parures de lit, ou le café proposé dans l'appartement. Une section
// boutique où le voyageur peut acheter ces produits… L'hôte touche
// une commission d'affiliation. »
export interface GuestShopItem {
  /** Identifiant stable (localStorage « commandé » côté invité). */
  id: string;
  name: string;
  emoji: string;
  /** Pitch d'affiliation (« Le café local que vous dégustez… »). */
  description?: string;
  /** Prix TTC en € (0 < prix ≤ 1000). */
  price: number;
  /** Lien marchand / affilié optionnel (ouvert dans un onglet). */
  url?: string;
}

/** Commission d'affiliation reversée à l'hôte (10 % du montant). */
export const SHOP_COMMISSION_RATE = 0.1;

/** Catalogue par défaut quand l'hôte n'a pas encore configuré sa boutique. */
export const DEFAULT_SHOP_ITEMS: GuestShopItem[] = [
  {
    id: 'coffee-local',
    name: 'Café local (sachet 250 g)',
    emoji: '☕',
    description:
      'Le café que vous dégustez dans l’appartement, torréfié par un artisan voisin. Livré dans votre boîte aux lettres chez vous.',
    price: 12,
  },
  {
    id: 'bed-linen',
    name: 'Parure de lit maison',
    emoji: '🛏️',
    description: 'La parure de lit que vous adorez : coton lavé, tissée en France. Livrée chez vous.',
    price: 39,
  },
  {
    id: 'hand-soap',
    name: 'Savon artisanal',
    emoji: '🧼',
    description: 'Le savon de la salle de bain, fabriqué à la main par une savonnerie du quartier.',
    price: 8,
  },
  {
    id: 'breakfast-basket',
    name: 'Panier petit-déjeuner',
    emoji: '🥐',
    description: 'Viennoiseries et confitures du marché — le goût du séjour, livré chez vous.',
    price: 18,
  },
];

function cleanShopItem(raw: unknown, index: number): GuestShopItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 60) : '';
  const price = typeof o.price === 'number' && Number.isFinite(o.price) && o.price > 0 && o.price <= 1000
    ? Math.round(o.price * 100) / 100
    : null;
  if (!name || price === null) return null;
  const description = typeof o.description === 'string' ? o.description.trim().slice(0, 300) : undefined;
  const url = cleanUrl(o.url, 500);
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 40) : `shop-${index}`,
    name,
    emoji: typeof o.emoji === 'string' && o.emoji.trim() ? o.emoji.trim().slice(0, 4) : '🛍️',
    ...(description ? { description } : {}),
    price,
    ...(url ? { url } : {}),
  };
}

/**
 * Lit premiumFeatures.shop → { items: [...] } (tolérant, jamais throw).
 * Catalogue vide/absent → catalogue par défaut (la boutique est
 * toujours disponible pour démontrer l'affiliation).
 */
export function parseShopItems(raw: unknown): GuestShopItem[] {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const shop = obj.shop as Record<string, unknown> | undefined;
  const items = shop?.items;
  if (Array.isArray(items)) {
    const parsed = items.slice(0, 8).map(cleanShopItem).filter((i): i is GuestShopItem => i !== null);
    if (parsed.length > 0) return parsed;
  }
  return DEFAULT_SHOP_ITEMS;
}

// ── 8-ter. v4.44 « MINIBAR NUMÉRIQUE » (Honesty Bar) ────────
// Demande client : « Les hôtels ont des minibars, apportez ce concept
// aux Airbnb. L'hôte laisse à disposition des snacks, du vin, des
// bières locales ou même des câbles de recharge neufs. Le voyageur
// ouvre la section dédiée, coche ce qu'il a consommé et paie
// instantanément. » Stocké dans premiumFeatures.minibar.items — prix
// TOUJOURS recalculés côté serveur à la commande (POST /minibar).
export interface GuestMinibarItem {
  /** Identifiant stable (localStorage panier côté invité). */
  id: string;
  name: string;
  emoji: string;
  /** Prix TTC en € (0 < prix ≤ 500). */
  price: number;
  /** v4.47 — VRAIE photo du produit (URL /uploads ou data-URL) : remplace
   *  l'icône emoji dans le hub invité (demande client : « le minibar doit
   *  avoir des photos de produits, pas des icônes »). */
  photo?: string;
  /** v4.50 « PACK DE BIENVENUE » — article OFFERT par l'hôte (ex : 2
   *  bouteilles d'eau) : mis en avant côté invité pour inciter à ouvrir
   *  le minibar numérique et découvrir les produits payants. Prix
   *  forcé à 0 côté serveur (jamais cru client). */
  free?: boolean;
}

/** Catalogue d'exemple (demo-hub + repli dashboard) — l'hôte personnalise. */
export const DEFAULT_MINIBAR_ITEMS: GuestMinibarItem[] = [
  { id: 'mb-water', name: 'Eau minérale 50 cl', emoji: '💧', price: 2 },
  { id: 'mb-soda', name: 'Soda / limonade artisanale', emoji: '🥤', price: 3 },
  { id: 'mb-beer', name: 'Bière locale', emoji: '🍺', price: 4 },
  { id: 'mb-wine', name: 'Verre de vin (bouteille ouverte)', emoji: '🍷', price: 5 },
  { id: 'mb-chips', name: 'Paquet de chips / biscuits', emoji: '🥨', price: 2.5 },
  { id: 'mb-choco', name: 'Tablette de chocolat', emoji: '🍫', price: 3.5 },
  { id: 'mb-cable', name: 'Câble de recharge neuf (USB-C)', emoji: '🔌', price: 12 },
  { id: 'mb-razor', name: 'Kit de rasage / trousse toilette', emoji: '🧴', price: 6 },
];

function cleanMinibarItem(raw: unknown, index: number): GuestMinibarItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 60) : '';
  const price =
    typeof o.price === 'number' && Number.isFinite(o.price) && o.price > 0 && o.price <= 500
      ? Math.round(o.price * 100) / 100
      : null;
  if (!name || price === null) return null;
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 40) : `mb-${index}`,
    name,
    emoji: typeof o.emoji === 'string' && o.emoji.trim() ? o.emoji.trim().slice(0, 4) : '🍷',
    price,
    // v4.47 — photo produit optionnelle (URL app /uploads, http(s) ou data-URL).
    photo:
      typeof o.photo === 'string' && /^(https?:\/\/|\/|data:image\/)/.test(o.photo.trim())
        ? o.photo.trim().slice(0, 500)
        : undefined,
    // v4.50 « PACK DE BIENVENUE » — article offert (badge 🎁, prix 0).
    ...(o.free === true ? { free: true } : {}),
  };
}

/**
 * Lit premiumFeatures.minibar.items (tolérant, jamais throw).
 * → { enabled, items, arrivalPhoto } — items vide/absent = catalogue
 * d'exemple si activé, [] sinon (le module n'apparaît que si l'hôte
 * l'active). arrivalPhoto = photo du minibar rempli pris par l'hôte
 * à l'arrivée (v4.50 — inventaire de confiance validé en 1 clic).
 */
export function parseMinibar(raw: unknown): {
  enabled: boolean;
  items: GuestMinibarItem[];
  arrivalPhoto?: string;
} {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const minibar = obj.minibar as Record<string, unknown> | undefined;
  const enabled = minibar?.enabled === true || obj.enableMinibar === true;
  const arrivalPhoto =
    typeof minibar?.arrivalPhoto === 'string' &&
    /^(https?:\/\/|\/|data:image\/)/.test(minibar.arrivalPhoto.trim())
      ? minibar.arrivalPhoto.trim().slice(0, 500_000)
      : undefined;
  if (!enabled) return { enabled: false, items: [] };
  const items = minibar?.items;
  if (Array.isArray(items)) {
    const parsed = items.slice(0, 20).map(cleanMinibarItem).filter((i): i is GuestMinibarItem => i !== null);
    if (parsed.length > 0) return { enabled: true, items: parsed, ...(arrivalPhoto ? { arrivalPhoto } : {}) };
  }
  return { enabled: true, items: DEFAULT_MINIBAR_ITEMS, ...(arrivalPhoto ? { arrivalPhoto } : {}) };
}

// ── 6-bis. v4.42 « HORAIRES DES MESSAGES VOCAUX » ───────────
// Demande client : « l'idéal est, dans le dashboard propriétaire, de
// mettre les heures à choisir pour déclencher ces vocaux ». Stocké
// dans premiumFeatures.voiceTriggers — défauts = spécification v4.37
// (veille 20 h, jour J 9 h). La BIENVENUE reste « 1er scan » (sans
// heure) : déclenchée uniquement à la première ouverture de l'invité.
export interface GuestVoiceTriggers {
  /** Heure locale min. de la voix « veille du départ » (0-23). */
  eveHour: number;
  /** Heure locale min. de la voix « jour du départ » (0-23). */
  dayHour: number;
}

export const DEFAULT_VOICE_TRIGGERS: GuestVoiceTriggers = { eveHour: 20, dayHour: 9 };

export function parseVoiceTriggers(raw: unknown): GuestVoiceTriggers {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const t = obj.voiceTriggers as Record<string, unknown> | undefined;
  const clampHour = (v: unknown, fallback: number): number => {
    const n = typeof v === 'number' ? Math.round(v) : NaN;
    return Number.isFinite(n) && n >= 0 && n <= 23 ? n : fallback;
  };
  return {
    eveHour: clampHour(t?.eveHour, DEFAULT_VOICE_TRIGGERS.eveHour),
    dayHour: clampHour(t?.dayHour, DEFAULT_VOICE_TRIGGERS.dayHour),
  };
}

// ── 7. Guide visuel d'arrivée (visualGuide) ─────────────────
export interface GuestVisualStep {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
}

export function parseVisualGuide(raw: unknown): GuestVisualStep[] {
  if (!Array.isArray(raw)) return [];
  const out: GuestVisualStep[] = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = cleanText(o.title, 80);
    if (!title) continue;
    out.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 60) : `vg-${out.length + 1}`,
      title,
      description: cleanText(o.description, 280),
      imageUrl: cleanUrl(o.imageUrl),
    });
  }
  return out;
}

// ── 8. Kit de survie (survivalKitItems) ─────────────────────
export interface GuestSurvivalItem {
  id: string;
  name: string;
  /** Où l'objet est rangé ("Tiroir de la cuisine"). */
  location?: string;
}

export function parseSurvivalKit(raw: unknown): GuestSurvivalItem[] {
  if (!Array.isArray(raw)) return [];
  const out: GuestSurvivalItem[] = [];
  for (const item of raw.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = cleanText(o.name, 60);
    if (!name) continue;
    out.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 60) : `kit-${out.length + 1}`,
      name,
      location: cleanText(o.location, 120),
    });
  }
  return out;
}
