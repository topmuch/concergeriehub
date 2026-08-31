// =============================================================
// Catalogue des AUTOMATISATIONS — ÉTAPE 13 V2
// Client-safe : aucune dépendance DB/serveur (importable partout).
// Le moteur d'exécution vit dans src/lib/automations-server.ts.
//
// Chaque bien possède une règle par entrée du catalogue
// (modèle AutomationRule, clé unique [propertyId, key]).
// L'utilisateur active/désactive chaque règle via un Switch.
// =============================================================

export const AUTOMATION_TRIGGERS = [
  'BOOKING_CREATED',
  'CLEANING_DONE',
  'CHECK_IN_TODAY',
  'CHECK_OUT_TODAY',
  'MAINTENANCE_REQUESTED',
  'MEMBER_ACCEPTED',
  'ORDER_CREATED', // ÉTAPE 17.3 : commande service depuis l'app invitée
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

/** Audiences notifiées (= champ `action` en base). */
export const AUTOMATION_ACTIONS = [
  'NOTIFY_OWNERS', // propriétaire + gestionnaires
  'NOTIFY_TEAM', // propriétaire + gestionnaires + ménage
  'NOTIFY_CLEANERS', // personnel de ménage (fallback : owners)
  'NOTIFY_MAINTENANCE', // maintenance (fallback : owners)
] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

export interface AutomationMeta {
  /** Identifiant stable de la règle (colonne `key`). */
  key: string;
  emoji: string;
  label: string;
  description: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
}

/**
 * Catalogue fixe — 8 automatisations. Déployé automatiquement sur
 * chaque bien (ensureDefaultRules), activé par défaut.
 */
export const AUTOMATIONS_CATALOG: AutomationMeta[] = [
  {
    key: 'booking_created_team',
    emoji: '📅',
    label: 'Nouvelle réservation',
    description:
      'Prévient le propriétaire et les gestionnaires dès qu’un séjour est créé sur le bien.',
    trigger: 'BOOKING_CREATED',
    action: 'NOTIFY_OWNERS',
  },
  {
    key: 'booking_created_cleaning',
    emoji: '🧹',
    label: 'Ménage à planifier',
    description:
      'Alerte le personnel de ménage quand un séjour est créé (fallback : propriétaire si aucun ménage dans l’équipe).',
    trigger: 'BOOKING_CREATED',
    action: 'NOTIFY_CLEANERS',
  },
  {
    key: 'cleaning_done_owner',
    emoji: '✨',
    label: 'Ménage terminé',
    description: 'Confirme au propriétaire et aux gestionnaires que le ménage est terminé.',
    trigger: 'CLEANING_DONE',
    action: 'NOTIFY_OWNERS',
  },
  {
    key: 'checkin_today_reminder',
    emoji: '🛬',
    label: 'Arrivée du jour',
    description:
      'Chaque matin, rappelle à l’équipe les voyageurs qui arrivent aujourd’hui (1 notification par séjour).',
    trigger: 'CHECK_IN_TODAY',
    action: 'NOTIFY_TEAM',
  },
  {
    key: 'checkout_today_reminder',
    emoji: '🛫',
    label: 'Départ du jour',
    description:
      'Chaque matin, rappelle à l’équipe les départs du jour — pensez au ménage après le séjour.',
    trigger: 'CHECK_OUT_TODAY',
    action: 'NOTIFY_TEAM',
  },
  {
    key: 'maintenance_alert',
    emoji: '🔧',
    label: 'Réclamation technique',
    description:
      'Alerte l’équipe maintenance (fallback : propriétaire) dès qu’une demande de service est créée.',
    trigger: 'MAINTENANCE_REQUESTED',
    action: 'NOTIFY_MAINTENANCE',
  },
  {
    key: 'member_accepted_owner',
    emoji: '👥',
    label: 'Nouveau membre dans l’équipe',
    description: 'Prévient le propriétaire quand un membre accepte son invitation.',
    trigger: 'MEMBER_ACCEPTED',
    action: 'NOTIFY_OWNERS',
  },
  {
    key: 'order_created_owner',
    emoji: '🥐',
    label: 'Nouvelle commande service',
    description:
      'Prévient le propriétaire et les gestionnaires dès qu’un invité commande un service depuis l’app de son logement (Étape 17).',
    trigger: 'ORDER_CREATED',
    action: 'NOTIFY_OWNERS',
  },
];

const CATALOG_BY_KEY = new Map(AUTOMATIONS_CATALOG.map((m) => [m.key, m]));

/** Métadonnées d'une règle par sa clé (null si clé inconnue). */
export function automationMeta(key: string): AutomationMeta | null {
  return CATALOG_BY_KEY.get(key) ?? null;
}

/** Types de notifications hôte (colonne Notification.type). */
export const HOST_NOTIFICATION_TYPES = [
  'host_booking',
  'host_cleaning',
  'host_checkin',
  'host_checkout',
  'host_maintenance',
  'host_team',
  'host_order', // ÉTAPE 17.3 : commande service (moteur de transaction)
] as const;
export type HostNotificationType = (typeof HOST_NOTIFICATION_TYPES)[number];

/** Emoji associé à un type de notification (fallback 🔔). */
export function notificationEmoji(type: string): string {
  switch (type) {
    case 'host_booking':
      return '📅';
    case 'host_cleaning':
      return '🧹';
    case 'host_checkin':
      return '🛬';
    case 'host_checkout':
      return '🛫';
    case 'host_maintenance':
      return '🔧';
    case 'host_team':
      return '👥';
    case 'host_order':
      return '🥐';
    default:
      return '🔔';
  }
}

/** Date formatée en français court : "12 août". */
export function formatFrDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Temps relatif en français : "à l’instant", "il y a 5 min", "il y a 2 h", "il y a 3 j". */
export function relativeFrTime(value: string | Date, now: Date = new Date()): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const diffMs = now.getTime() - d.getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return 'à l’instant';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}
