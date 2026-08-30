/**
 * Conciergerie Hub — Business-logic types & constants
 *
 * This file defines enums, type aliases and utility types that Prisma
 * cannot express natively (SQLite stores everything as strings / ints /
 * floats).  Import these wherever you need type-safe business-logic
 * constants.  NEVER re-define Prisma models here — those come from
 * `@prisma/client`.
 */

// ---------------------------------------------------------------------------
//  Type Aliases (string-literal unions)
// ---------------------------------------------------------------------------

/** Roles that a platform-wide user can hold. */
export type UserRole = 'user' | 'superadmin';

/** Roles that a member can have inside a specific Home. */
export type HomeMemberRole = 'owner' | 'cohost' | 'staff' | 'cleaner' | 'member';

/** Lifecycle statuses for a physical (printed) QR code. */
export type PhysicalQrStatus = 'inactive' | 'active' | 'lost' | 'cancelled';

/** Actions recorded in a QR-code activation log. */
export type ActivationAction = 'activated' | 'deactivated' | 'marked_lost';

/** Freshness / consumption status of a product instance. */
export type ProductInstanceStatus =
  | 'fresh'
  | 'warning'
  | 'critical'
  | 'expired'
  | 'consumed';


/** Where a promo / advertisement originates from. */
export type PromoSource = 'local' | 'scraped';

/** Lifecycle of a web-scraping job. */
export type ScrapingJobStatus = 'running' | 'success' | 'failed';

/** Subscription pricing tier. */
export type SubscriptionTier = 'free' | 'premium' | 'featured';

/** Current state of a subscription. */
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due';

/** Lifecycle of a service request. */
export type ServiceRequestStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

/** Unit used to price a service. */
export type PriceUnit = 'hour' | 'flat_rate' | 'estimate';

/** How urgent a service request is. */
export type UrgencyLevel = 'normal' | 'urgent' | 'emergency';

/** Financial transaction kind. */
export type TransactionType =
  | 'flash_sale'
  | 'commission'
  | 'subscription'
  | 'redemption';

/** Lifecycle of a financial transaction. */
export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'refunded';

/** Kind of subscriber on the marketplace. */
export type SubscriberType = 'merchant' | 'provider';

/** Flash sale lifecycle statuses. */
export type FlashSaleStatus = 'scheduled' | 'active' | 'expired' | 'cancelled';

/** Coupon discount calculation method. */
export type CouponDiscountType = 'percentage' | 'fixed' | 'bogof';

/** Coupon lifecycle statuses. */
export type CouponStatus = 'active' | 'used' | 'expired' | 'cancelled';

/** Who sent a chat message. */
export type ChatSenderType = 'homeowner' | 'provider';

/** Type of chat message content. */
export type ChatMessageType = 'text' | 'image' | 'document' | 'system';

/** Notification delivery type. */
export type NotificationType =
  | 'flash_sale_nearby'
  | 'coupon_expiring'
  | 'service_request_update'
  | 'service_chat'
  | 'promo_match'
  | 'stock_alert'
  | 'membership_invite'
  | 'system';

// ---------------------------------------------------------------------------
//  Const arrays (handy for <select> dropdowns, Zod enums, validation, …)
// ---------------------------------------------------------------------------

export const USER_ROLES: readonly UserRole[] = [
  'user',
  'superadmin',
] as const;

export const HOME_MEMBER_ROLES: readonly HomeMemberRole[] = [
  'owner',
  'cohost',
  'staff',
  'cleaner',
  'member',
] as const;

export const PHYSICAL_QR_STATUSES: readonly PhysicalQrStatus[] = [
  'inactive',
  'active',
  'lost',
  'cancelled',
] as const;

export const ACTIVATION_ACTIONS: readonly ActivationAction[] = [
  'activated',
  'deactivated',
  'marked_lost',
] as const;

export const PRODUCT_INSTANCE_STATUSES: readonly ProductInstanceStatus[] = [
  'fresh',
  'warning',
  'critical',
  'expired',
  'consumed',
] as const;





export const PROMO_SOURCES: readonly PromoSource[] = [
  'local',
  'scraped',
] as const;

export const SCRAPING_JOB_STATUSES: readonly ScrapingJobStatus[] = [
  'running',
  'success',
  'failed',
] as const;

export const SUBSCRIPTION_TIERS: readonly SubscriptionTier[] = [
  'free',
  'premium',
  'featured',
] as const;

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'active',
  'cancelled',
  'past_due',
] as const;

export const SERVICE_REQUEST_STATUSES: readonly ServiceRequestStatus[] = [
  'pending',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
  'disputed',
] as const;

export const PRICE_UNITS: readonly PriceUnit[] = [
  'hour',
  'flat_rate',
  'estimate',
] as const;

export const URGENCY_LEVELS: readonly UrgencyLevel[] = [
  'normal',
  'urgent',
  'emergency',
] as const;

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  'flash_sale',
  'commission',
  'subscription',
  'redemption',
] as const;

export const TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  'pending',
  'completed',
  'failed',
  'refunded',
] as const;

export const SUBSCRIBER_TYPES: readonly SubscriberType[] = [
  'merchant',
  'provider',
] as const;

export const FLASH_SALE_STATUSES: readonly FlashSaleStatus[] = [
  'scheduled',
  'active',
  'expired',
  'cancelled',
] as const;

export const COUPON_DISCOUNT_TYPES: readonly CouponDiscountType[] = [
  'percentage',
  'fixed',
  'bogof',
] as const;

export const COUPON_STATUSES: readonly CouponStatus[] = [
  'active',
  'used',
  'expired',
  'cancelled',
] as const;

export const CHAT_SENDER_TYPES: readonly ChatSenderType[] = [
  'homeowner',
  'provider',
] as const;

export const CHAT_MESSAGE_TYPES: readonly ChatMessageType[] = [
  'text',
  'image',
  'document',
  'system',
] as const;

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'flash_sale_nearby',
  'coupon_expiring',
  'service_request_update',
  'service_chat',
  'promo_match',
  'stock_alert',
  'membership_invite',
  'system',
] as const;

// ---------------------------------------------------------------------------
//  QR Code Module Types
// ---------------------------------------------------------------------------

/**
 * Legacy QR module type identifiers (Qrdoo V1/V2/V3).
 * Conservé uniquement pour la rétro-compatibilité d'affichage :
 * les labels et les renderers doivent savoir traiter les données existantes.
 * Le catalogue SÉLECTIONNABLE côté B2B est `B2B_MODULES` ci-dessous.
 */
export const QR_MODULE_TYPES = {
  V1: [
    'wifi',
    'guestbook',
    'doorbell',
    'emergency',
    'note',
    'contact',
  ] as const,

  V2: [
    'shopping_list',
    'inventory',
    'checklist',
    'home_manual',
    'house_rules',
    'external_link',
  ] as const,

  V3: [
    'promo',
    'artisan_directory',
  ] as const,
} as const;

// ---------------------------------------------------------------------------
//  Catalogue B2B Conciergerie Hub — 6 modules métier
// ---------------------------------------------------------------------------

/**
 * Les 6 modules métier de Conciergerie Hub (spécification B2B).
 * Chaque module est mappé sur un type DB concret (compatibles legacy).
 * Tout nouveau module proposé aux hôtes doit être ajouté ici.
 */
export const B2B_MODULES = [
  {
    key: 'WIFI',
    dbType: 'wifi',
    label: 'Wi-Fi',
    emoji: '📶',
    description: 'Identifiants Wi-Fi accessibles aux voyageurs',
  },
  {
    key: 'GUIDEBOOK',
    dbType: 'home_manual',
    label: 'Guidebook',
    emoji: '📖',
    description: 'Guide de bienvenue : accès, équipements, bonnes adresses',
  },
  {
    key: 'CHECKOUT',
    dbType: 'checklist',
    label: 'Check-out',
    emoji: '🧹',
    description: 'Check-list de départ pour les voyageurs et l’équipe de ménage',
  },
  {
    key: 'COMPLAINT',
    dbType: 'contact',
    label: 'Réclamations',
    emoji: '🛎️',
    description: 'Canal direct voyageur → hôte pour signalements et demandes',
  },
  {
    key: 'UPSELLING',
    dbType: 'promo',
    label: 'Upselling',
    emoji: '⭐',
    description: 'Services payants : petit-déjeuner, ménage, sorties…',
  },
  {
    key: 'PROVIDER_DIRECTORY',
    dbType: 'artisan_directory',
    label: 'Annuaire prestataires',
    emoji: '🛠️',
    description: 'Ménage, plomberie, maintenance : vos prestataires de confiance',
  },
] as const;

/** Union of the B2B module identifiers (as stored in DB). */
export type QrModuleType =
  | (typeof QR_MODULE_TYPES.V1)[number]
  | (typeof QR_MODULE_TYPES.V2)[number]
  | (typeof QR_MODULE_TYPES.V3)[number];

/** Union of the 6 B2B business module keys (WIFI, GUIDEBOOK, …). */
export type B2BModuleKey = (typeof B2B_MODULES)[number]['key'];

/**
 * Flat, read-only array with every selectable module type.
 * B2B : limité au catalogue Conciergerie Hub (les 6 modules métier).
 */
export const ALL_QR_MODULE_TYPES: readonly QrModuleType[] = [
  ...B2B_MODULES.map((m) => m.dbType),
] as const;

// ---------------------------------------------------------------------------
//  French Labels for QR Module Types
// ---------------------------------------------------------------------------

/**
 * Maps QR module type keys to their human-readable French label.
 * Typé souplement (Record<string, string>) pour que les données legacy
 * déjà en base continuent d'afficher un label lisible.
 */
export const QR_MODULE_LABELS: Record<string, string> = {
  // Catalogue B2B Conciergerie Hub
  wifi: 'Wi-Fi',
  home_manual: 'Guidebook',
  checklist: 'Check-out',
  contact: 'Réclamations',
  promo: 'Upselling',
  artisan_directory: 'Annuaire prestataires',

  // Legacy conservés pour l'affichage des données existantes
  guestbook: "Livre d'or",
  doorbell: 'Sonnette',
  emergency: 'Urgence',
  note: 'Note',
  shopping_list: 'Liste de courses',
  inventory: 'Inventaire',
  house_rules: 'Règles de la maison',
  external_link: 'Lien externe',
  key_location: 'Emplacement des clés',
};

// ---------------------------------------------------------------------------
//  Merchant / Provider Categories (French)
// ---------------------------------------------------------------------------

/**
 * Available business categories for merchants and professionals.
 * All labels are in French as the app targets a French-speaking audience.
 */
export const CATEGORIES = [
  // Artisanat / BTP
  'Plomberie',
  'Électricité',
  'Menuiserie',
  'Peinture',
  'Maçonnerie',
  'Couverture',
  'Carrelage',
  'Climatisation',
  'Serrurerie',
  'Vitrerie',

  // Alimentation
  'Boulangerie',
  'Boucherie',
  'Épicerie',
  'Pâtisserie',
  'Fromagerie',
  'Poissonnerie',
  'Boulangerie-pâtisserie',
  'Épicerie fine',
  'Primeur',
  'Caviste',
  'Confiserie',
  'Traiteur',

  // Services divers
  'Fleuriste',
  'Coiffure',
  'Esthétique',
  'Médecine',
  'Pharmacie',
  'Dentiste',
  'Kinésithérapie',
  'Opticien',
  'Vétérinaire',
  'Taxi',
  'Déménagement',
  'Entretien',
  'Jardinage',
  'Piscine',
  'Nettoyage',
  'Repassage',

  // Tech & Conseil
  'Informatique',
  'Téléphonie',
  'Domotique',
  'Conseil financier',
  'Conseil juridique',
  'Immobilier',
  'Architecture',
  'Photographie',
] as const;

/** Union type derived from the CATEGORIES array. */
export type Category = (typeof CATEGORIES)[number];

// ---------------------------------------------------------------------------
//  Utility Types
// ---------------------------------------------------------------------------

/**
 * Extracts the string-literal values from a `readonly T[]` const array.
 *
 * @example
 * ```ts
 * type Roles = ArrayElement<typeof USER_ROLES>; // 'user' | 'superadmin'
 * ```
 */
export type ArrayElement<T extends readonly unknown[]> = T[number];

/**
 * Makes every property of `T` required (inverse of `Partial<T>`).
 */
export type RequiredFields<T> = {
  [P in keyof T]-?: T[P];
};

/**
 * Picks only the keys from `T` whose values are assignable to `V`.
 */
export type PickByValue<T, V> = {
  [P in keyof T as T[P] extends V ? P : never]: T[P];
};

/**
 * Constructs a type that represents a paginated response.
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Standard API error shape returned by backend routes.
 */
export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
}

/**
 * Generic wrapper used by many API routes for success responses.
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
}

/**
 * Identifier payload returned after scanning a QR code.
 */
export interface QrScanPayload {
  /** Unique identifier of the QR code record. */
  qrId: string;
  /** The module type this QR code resolves to. */
  moduleType: QrModuleType;
  /** Version group (1, 2, or 3). */
  version: 1 | 2 | 3;
  /** Home id the QR code belongs to (may be null for V3). */
  propertyId: string | null;
}
