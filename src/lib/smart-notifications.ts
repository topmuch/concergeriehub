// =============================================================
// v4.74 « SMART PROMPTS » — lib partagée SERVEUR des notifications
// temporelles (petit-déjeuner / déjeuner / dîner / veille de départ)
// et de la boutique de souvenirs.
//
// Rôle :
//  • source de vérité des valeurs par défaut + validation stricte
//    (zod) des entrées hôte → messages FR explicites ;
//  • helpers HH:mm (comparaison « dans une fenêtre de ±5 min ») et
//    fenêtre journalière locale pour l'anti-doublon NotificationLog.
// =============================================================
import { z } from 'zod';

// v4.112 — nouveaux types du MOTEUR DE RECOMMANDATION CONTEXTUEL :
// 'minibar' (soirée/chaleur), 'food' (repas × météo × chef),
// 'activity' (sorties en milieu de séjour). Ils partagent la même
// table NotificationLog (anti-doublon 1×/jour) que les prompts horaires.
export const NOTIFICATION_TYPES = [
  'breakfast',
  'lunch',
  'dinner',
  'checkout_reminder',
  'minibar',
  'food',
  'activity',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  checkout_reminder: 'Veille de départ',
  minibar: 'Minibar',
  food: 'Restauration',
  activity: 'Sorties & événements',
};

/** Durée d'affichage bornée (minutes). */
export const DISPLAY_DURATION_MIN = 10;
export const DISPLAY_DURATION_MAX = 60;

/** Fenêtre de déclenchement : |maintenant − heure configurée| ≤ 5 min. */
export const TRIGGER_WINDOW_MINUTES = 5;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const timeField = (label: string) =>
  z.string().regex(HHMM, `${label} : heure invalide (HH:mm attendu).`);
const messageField = (label: string, max = 160) =>
  z.string().trim().min(1, `${label} : message requis.`).max(max, `${label} : ${max} caractères maximum.`);

/** Schéma de SAUVEGARDE côté hôte (PATCH complet, champs requis). */
export const notificationSettingsSchema = z.object({
  enableBreakfast: z.boolean(),
  breakfastTime: timeField('Petit-déjeuner'),
  breakfastMessage: messageField('Petit-déjeuner'),
  enableLunch: z.boolean(),
  lunchTime: timeField('Déjeuner'),
  lunchMessage: messageField('Déjeuner'),
  enableDinner: z.boolean(),
  dinnerTime: timeField('Dîner'),
  dinnerMessage: messageField('Dîner'),
  enableCheckoutReminder: z.boolean(),
  checkoutReminderTime: timeField('Veille de départ'),
  checkoutReminderMessage: messageField('Veille de départ'),
  displayDuration: z
    .number()
    .int()
    .min(DISPLAY_DURATION_MIN, `Durée minimum : ${DISPLAY_DURATION_MIN} min`)
    .max(DISPLAY_DURATION_MAX, `Durée maximum : ${DISPLAY_DURATION_MAX} min`),
  enableRestaurantRecommendations: z.boolean(),
});
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

/** Valeurs par défaut (miroir du schéma Prisma) pour l'UI + repli hub. */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsInput = {
  enableBreakfast: true,
  breakfastTime: '08:00',
  breakfastMessage: "☀️ Bonjour ! Souhaitez-vous commander votre petit-déjeuner ce matin ?",
  enableLunch: true,
  lunchTime: '12:00',
  lunchMessage: "🍽️ C'est l'heure du déjeuner ! Découvrez nos suggestions.",
  enableDinner: true,
  dinnerTime: '19:00',
  dinnerMessage: "🌙 Bonne soirée ! Envie d'un dîner ou d'une réservation au restaurant ?",
  enableCheckoutReminder: true,
  checkoutReminderTime: '18:00',
  checkoutReminderMessage: '🛍️ Demain est votre dernier jour ! Découvrez notre boutique de souvenirs.',
  displayDuration: 30,
  enableRestaurantRecommendations: true,
};

/** Normalise une ligne DB (partielle) vers l'input complet. */
export function normalizeSettings(row: Partial<NotificationSettingsInput> | null | undefined): NotificationSettingsInput {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(row ?? {}) };
}

/** « HH:mm » → minutes depuis minuit (0 si invalide). */
export function hhmmToMinutes(hhmm: string): number {
  const m = HHMM.exec(hhmm.trim());
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** L'heure actuelle (minutes locales) est-elle dans la fenêtre de déclenchement ? */
export function isTriggerTime(hhmm: string, now: Date = new Date()): boolean {
  const target = hhmmToMinutes(hhmm);
  if (target < 0) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return Math.abs(current - target) <= TRIGGER_WINDOW_MINUTES;
}

/** Début (00:00 local) du « jour » demandé ou du jour courant. */
export function startOfLocalDay(day?: string | null): Date {
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const d = new Date(`${day}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

/** Fin (24:00 local) du même jour. */
export function endOfLocalDay(start: Date): Date {
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0);
}

// ── Boutique de souvenirs ────────────────────────────────────────

export const SOUVENIR_CATEGORIES = ['food', 'craft', 'wine', 'other'] as const;
export type SouvenirCategory = (typeof SOUVENIR_CATEGORIES)[number];

export const SOUVENIR_CATEGORY_LABEL: Record<SouvenirCategory, string> = {
  food: '🫙 Nourriture artisanale',
  wine: '🍷 Vins & spiritueux',
  craft: '🏺 Artisanat',
  other: '🎁 Autres',
};

export const souvenitOrderSchema = z.object({
  productId: z.string().min(1).max(60),
  quantity: z.number().int().min(1).max(10),
  // 'in_lodging' | 'at_checkout'
  deliveryMode: z.enum(['in_lodging', 'at_checkout']),
  guestNote: z.string().trim().max(300).optional().or(z.literal('')),
});
