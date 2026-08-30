/**
 * QR Domotik — Business-logic types & constants
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
export type HomeMemberRole = 'owner' | 'admin' | 'member' | 'child';

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

/** How often a chore repeats. */
export type ChoreFrequency = 'daily' | 'weekly' | 'once';

/** Validation state of a chore completion. */
export type ChoreCompletionStatus =
  | 'pending_validation'
  | 'validated'
  | 'rejected';

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
export type SubscriberType = 'merchant' | 'professional';

/** Flash sale lifecycle statuses. */
export type FlashSaleStatus = 'scheduled' | 'active' | 'expired' | 'cancelled';

/** Coupon discount calculation method. */
export type CouponDiscountType = 'percentage' | 'fixed' | 'bogof';

/** Coupon lifecycle statuses. */
export type CouponStatus = 'active' | 'used' | 'expired' | 'cancelled';

/** Who sent a chat message. */
export type ChatSenderType = 'homeowner' | 'professional';

/** Type of chat message content. */
export type ChatMessageType = 'text' | 'image' | 'document' | 'system';

/** Notification delivery type. */
export type NotificationType =
  | 'flash_sale_nearby'
  | 'coupon_expiring'
  | 'service_request_update'
  | 'service_chat'
  | 'promo_match'
  | 'chore_reminder'
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
  'admin',
  'member',
  'child',
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

export const CHORE_FREQUENCIES: readonly ChoreFrequency[] = [
  'daily',
  'weekly',
  'once',
] as const;

export const CHORE_COMPLETION_STATUSES: readonly ChoreCompletionStatus[] = [
  'pending_validation',
  'validated',
  'rejected',
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
  'professional',
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
  'professional',
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
  'chore_reminder',
  'stock_alert',
  'membership_invite',
  'system',
] as const;

// ---------------------------------------------------------------------------
//  QR Code Module Types
// ---------------------------------------------------------------------------

/**
 * All QR code module type identifiers, organised by product version.
 *
 * V1 — Foundational smart-home modules.
 * V2 — Extended daily-life & utility modules.
 * V3 — Marketplace & professional-service modules.
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
    'chore',
    'checklist',
    'timer',
    'recipe',
    'medication',
    'pet_info',
    'plant_care',
    'home_manual',
    'visitor_info',
    'delivery',
    'baby_sitter',
    'house_rules',
    'wifi_reset',
    'appliance_manual',
    'energy_monitor',
    'cleaning_schedule',
    'meal_planner',
    'external_link',
    'shared_calendar',
    'key_location',
    'garage_instructions',
    'laundry_guide',
    'recycling_info',
    'utility_shutoff',
    'first_aid',
    'pet_sitter',
    'rental_guest',
    'airbnb_guest',
    'emergency_contacts',
    'package_tracking',
    'home_network',
    'entertainment',
    'music_room',
    'game_room',
    'library',
    'photo_gallery',
    'family_board',
    'announcement',
    'mood_tracker',
    'habit_tracker',
    'weather_station',
    'smart_home_control',
    'voice_assistant',
  ] as const,

  V3: [
    'merchant',
    'service_request',
    'promo',
    'flash_sale',
    'coupon',
    'emergency_service',
    'artisan_directory',
  ] as const,
} as const;

/** Union of every QR module type across all versions. */
export type QrModuleType =
  | (typeof QR_MODULE_TYPES.V1)[number]
  | (typeof QR_MODULE_TYPES.V2)[number]
  | (typeof QR_MODULE_TYPES.V3)[number];

/** Flat, read-only array with every module type (useful for iteration). */
export const ALL_QR_MODULE_TYPES: readonly QrModuleType[] = [
  ...QR_MODULE_TYPES.V1,
  ...QR_MODULE_TYPES.V2,
  ...QR_MODULE_TYPES.V3,
] as const;

// ---------------------------------------------------------------------------
//  French Labels for QR Module Types
// ---------------------------------------------------------------------------

/**
 * Maps every QR module type key to its human-readable French label.
 * Used throughout the UI for display in selects, headings, badges, etc.
 */
export const QR_MODULE_LABELS: Record<QrModuleType, string> = {
  // V1
  wifi: 'Wi-Fi',
  guestbook: "Livre d'or",
  doorbell: 'Sonnette',
  emergency: 'Urgence',
  note: 'Note',
  contact: 'Contact',

  // V2
  shopping_list: 'Liste de courses',
  inventory: 'Inventaire',
  chore: 'Corvées',
  checklist: 'Liste de contrôle',
  timer: 'Minuterie',
  recipe: 'Recette',
  medication: 'Médicaments',
  pet_info: 'Info animal',
  plant_care: 'Soins des plantes',
  home_manual: "Page Info / Guide",
  visitor_info: 'Info visiteur',
  delivery: 'Livraison',
  baby_sitter: 'Baby-sitter',
  house_rules: 'Règles de la maison',
  wifi_reset: 'Réinitialisation Wi-Fi',
  appliance_manual: "Manuel d'appareil",
  energy_monitor: 'Moniteur énergétique',
  cleaning_schedule: 'Planning de nettoyage',
  meal_planner: 'Planificateur de repas',
  external_link: 'Lien externe',
  shared_calendar: 'Calendrier partagé',
  key_location: 'Emplacement des clés',
  garage_instructions: 'Instructions garage',
  laundry_guide: 'Guide de lavage',
  recycling_info: 'Info recyclage',
  utility_shutoff: "Coupe utilités",
  first_aid: 'Premiers secours',
  pet_sitter: 'Pet-sitter',
  rental_guest: 'Locataire invité',
  airbnb_guest: "Invité Airbnb",
  emergency_contacts: "Contacts d'urgence",
  package_tracking: 'Suivi de colis',
  home_network: 'Réseau domestique',
  entertainment: 'Divertissement',
  music_room: "Salle de musique",
  game_room: 'Salle de jeux',
  library: 'Bibliothèque',
  photo_gallery: 'Galerie photos',
  family_board: 'Tableau familial',
  announcement: 'Annonce',
  mood_tracker: 'Suivi d\'humeur',
  habit_tracker: 'Suivi d\'habitudes',
  weather_station: 'Station météo',
  smart_home_control: 'Domotique',
  voice_assistant: 'Assistant vocal',

  // V3
  merchant: 'Commerçant',
  service_request: 'Demande de service',
  promo: 'Promotion',
  flash_sale: 'Vente flash',
  coupon: 'Coupon numérique',
  emergency_service: 'Service d\'urgence',
  artisan_directory: 'Annuaire artisans',
};

// ---------------------------------------------------------------------------
//  Merchant / Professional Categories (French)
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
  homeId: string | null;
}
