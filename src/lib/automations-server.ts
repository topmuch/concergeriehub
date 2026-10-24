// =============================================================
// MOTEUR D'AUTOMATISATIONS — ÉTAPE 13 V2 (server-only)
// NE PAS importer côté client (dépend de la DB).
//
// - ensureDefaultRules(propertyId)  : déploie le catalogue sur un bien
// - runAutomationTrigger(...)       : exécute les règles immédiates
//   (BOOKING_CREATED, CLEANING_DONE, MAINTENANCE_REQUESTED,
//    MEMBER_ACCEPTED, ORDER_CREATED)
// - runDailyAutomations(propertyIds): tick lazy des rappels du jour
//   (CHECK_IN_TODAY / CHECK_OUT_TODAY) — lastRunAt garantit 1 run/jour
//
// v5.20 — RESPECT DES PRÉFÉRENCES (lacune d'audit) : chaque envoi
// passe désormais par le service unifié sendNotificationToMany()
// qui filtre email + push VAPID selon les préférences de CHAQUE
// destinataire (Paramètres → Notifications, catalogue
// notification-prefs.ts). Le type in-app historique ('host_checkin'
// …) est préservé pour les icônes de la cloche ; la clé de prefs
// est déduite du trigger (PREF_KEY_BY_TRIGGER). Le récapitulatif
// d'équipe du Bouclier d'avis est régi par 'review_shield_today' —
// l'email/SMS envoyé au VOYAGEUR lui, ne dépend jamais des prefs hôte.
// v5.20 — RÉSERVATIONS ICAL (lacune d'audit) : notifyIcalImport()
// envoie un récapitulatif à l'hôte après chaque synchronisation de
// calendrier ayant CRÉÉ des séjours (1 seul récap par sync, jamais
// de relance pour les mises à jour).
//
// Garantie : le moteur ne JAMAIS faire échouer le flux métier qui
// l'appelle (réservation, ménage…). Toutes les erreurs sont loguées
// et avalées.
// =============================================================
import { db } from '@/lib/db';
import { normalizeMemberRole, memberRoleMeta, type MemberRole } from '@/lib/team';
import {
  AUTOMATIONS_CATALOG,
  formatFrDate,
  type AutomationAction,
  type AutomationTrigger,
} from '@/lib/automations';
import { queueEmail } from '@/lib/email';
// v5.20 — l'email des notifications passe par le service unifié
// (renderHostNotificationEmail y est déjà utilisé, DB-first FIX-12).
// PREMIUM V5 — « Bouclier d'avis au départ » : SMS Twilio (env-gated,
// fail-closed) + URL canonique + parseur premiumFeatures.
import { sendSms } from '@/lib/sms';
// v5.20 — délégation au service unifié (préférences respectées)
import {
  sendNotificationToMany,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
// AUDIT PRÉ-PROD — CRON iCal : parse + upsert des réservations distantes
import {
  parseIcalEvents,
  upsertIcalBookings,
  type IcalCreatedBooking,
} from '@/lib/ical';
import { siteUrl } from '@/lib/site';
import { parsePremiumFeatures } from '@/lib/concierge';

// -------------------------------------------------------------
// Contextes de déclenchement
// -------------------------------------------------------------

export interface BookingCtx {
  id: string;
  guestName: string;
  checkIn: Date | string;
  checkOut: Date | string;
  guests?: number;
  cleaningStatus?: string;
}

export interface MaintenanceCtx {
  id: string;
  description?: string | null;
  urgencyLevel?: string | null;
}

export interface MemberCtx {
  /** Nom affichable du membre (fullName ou email). */
  displayName: string;
  role: MemberRole;
}

export interface OrderCtx {
  id: string;
  guestName: string;
  /** Montant total en euros (Float). */
  totalAmount: number;
  /** Nom commercial du prestataire (ex. "Morning Box Paris"). */
  providerName: string;
  /** Résumé lisible des lignes (ex. "2× Box M"). */
  itemsSummary: string;
}

export type AutomationCtx =
  | { kind: 'booking'; booking: BookingCtx }
  | { kind: 'maintenance'; request: MaintenanceCtx }
  | { kind: 'member'; member: MemberCtx }
  | { kind: 'order'; order: OrderCtx }; // ÉTAPE 17.3

/**
 * v5.20 — Clé de CATALOGUE de préférences (notification-prefs.ts)
 * réglant les canaux (email / push) de chaque trigger. Les types
 * historiques ('host_checkin'…) ne sont pas des clés de catalogue :
 * sans mapping, prefsFor retomberait sur email/push = true pour
 * TOUS — la lacune signalée par l'audit. Les clés manquantes du
 * catalogue (checkin_j3, checkout_j1, review_shield_today) y ont
 * été ajoutées (toggles auto-rendus dans Paramètres → Notifications).
 */
const PREF_KEY_BY_TRIGGER: Record<string, string> = {
  BOOKING_CREATED: 'booking_created',
  CLEANING_DONE: 'cleaning_done',
  MAINTENANCE_REQUESTED: 'maintenance_alert',
  MEMBER_ACCEPTED: 'team_updates',
  ORDER_CREATED: 'new_order',
  CHECK_IN_TODAY: 'checkin_today',
  CHECK_OUT_TODAY: 'checkout_today',
  CHECK_IN_J3: 'checkin_j3',
  CHECK_OUT_J1: 'checkout_j1',
  REVIEW_SHIELD_TODAY: 'review_shield_today',
};

interface NotificationPayload {
  type: string;
  title: string;
  body: string;
}

// -------------------------------------------------------------
// Utilitaires
// -------------------------------------------------------------

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function toIso(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

/** Identifiants des membres ACCEPTÉS d'un bien ayant l'un des rôles donnés. */
async function memberIdsByRoles(propertyId: string, roles: MemberRole[]): Promise<string[]> {
  const members = await db.propertyMember.findMany({
    where: { propertyId, acceptedAt: { not: null } },
    select: { userId: true, role: true },
  });
  const wanted = new Set(roles);
  const ids = members
    .filter((m) => wanted.has(normalizeMemberRole(m.role)))
    .map((m) => m.userId);
  return Array.from(new Set(ids));
}

/** OWNER du bien (toujours présent, même sans PropertyMember). */
async function ownerUserId(propertyId: string): Promise<string | null> {
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { ownerId: true },
  });
  return property?.ownerId ?? null;
}

/**
 * Résout l'audience d'une action :
 * - NOTIFY_OWNERS      → OWNER + MANAGER
 * - NOTIFY_TEAM        → OWNER + MANAGER + CLEANER
 * - NOTIFY_CLEANERS    → CLEANER (fallback OWNER + MANAGER)
 * - NOTIFY_MAINTENANCE → MAINTENANCE (fallback OWNER + MANAGER)
 */
async function resolveAudience(propertyId: string, action: AutomationAction): Promise<string[]> {
  const owner = await ownerUserId(propertyId);
  const managers = await memberIdsByRoles(propertyId, ['MANAGER']);
  const cleaners = await memberIdsByRoles(propertyId, ['CLEANER']);
  const maintenance = await memberIdsByRoles(propertyId, ['MAINTENANCE']);

  const ownersAndManagers = Array.from(new Set([...(owner ? [owner] : []), ...managers]));

  switch (action) {
    case 'NOTIFY_OWNERS':
      return ownersAndManagers;
    case 'NOTIFY_TEAM':
      return Array.from(new Set([...ownersAndManagers, ...cleaners]));
    case 'NOTIFY_CLEANERS':
      return cleaners.length > 0 ? cleaners : ownersAndManagers;
    case 'NOTIFY_MAINTENANCE':
      return maintenance.length > 0 ? maintenance : ownersAndManagers;
    default:
      return ownersAndManagers;
  }
}

// v5.20 — l'ancien miroir email (emailMirror, ÉTAPE 22) est remplacé
// par la délégation au service unifié sendNotificationToMany() :
// même template, mais l'email ne part PLUS sans le consentement de
// l'hôte (Paramètres → Notifications par événement).

/**
 * Crée les notifications (dédupliqué) + miroir email. Ne lève jamais.
 *
 * v5.20 — Délègue au service unifié sendNotificationToMany() :
 *  - in-app : toujours créé (journal + cloche — icône via payload.type) ;
 *  - email + push VAPID : filtrés selon les PRÉFÉRENCES de chaque
 *    destinataire (lacune d'audit corrigée) ;
 *  - prefKey : clé du catalogue de préférences réglant les canaux
 *    (PREF_KEY_BY_TRIGGER). Absent → clé = payload.type, qui retombe
 *    alors sur les défauts du catalogue (email/push activés).
 */
async function pushNotifications(
  userIds: string[],
  payload: NotificationPayload,
  dataJson: string,
  prefKey?: string,
): Promise<number> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return 0;
  try {
    let parsed: {
      propertyId?: string;
      propertyName?: string;
      url?: string;
      trigger?: string;
      bookingId?: string;
      requestId?: string;
      orderId?: string;
    } = {};
    try {
      parsed = JSON.parse(dataJson);
    } catch {
      // dataJson illisible : on notifie sans deep-link ni métadonnées
    }
    const res = await sendNotificationToMany(unique, payload.type, {
      title: payload.title,
      body: payload.body,
      url: parsed.url,
      propertyId: parsed.propertyId,
      propertyName: parsed.propertyName,
      prefKey,
      meta: {
        trigger: parsed.trigger,
        notificationType: payload.type,
        ...(parsed.bookingId ? { bookingId: parsed.bookingId } : {}),
        ...(parsed.requestId ? { requestId: parsed.requestId } : {}),
        ...(parsed.orderId ? { orderId: parsed.orderId } : {}),
      },
    });
    return res.sent;
  } catch (error) {
    console.error('[automations] pushNotifications failed:', error);
    return 0;
  }
}

// -------------------------------------------------------------
// Déploiement du catalogue
// -------------------------------------------------------------

/**
 * Crée les règles manquantes du catalogue pour un bien (idempotent).
 * ⚠️ SQLite ne supporte pas createMany({ skipDuplicates }) — on filtre
 * les clés existantes avant insertion.
 */
export async function ensureDefaultRules(propertyId: string): Promise<void> {
  try {
    const existing = await db.automationRule.findMany({
      where: { propertyId },
      select: { key: true },
    });
    const have = new Set(existing.map((r) => r.key));
    const missing = AUTOMATIONS_CATALOG.filter((m) => !have.has(m.key));
    if (missing.length === 0) return;
    await db.automationRule.createMany({
      data: missing.map((m) => ({
        propertyId,
        key: m.key,
        trigger: m.trigger,
        action: m.action,
        isActive: true,
      })),
    });
  } catch (error) {
    console.error('[automations] ensureDefaultRules failed:', error);
  }
}

// -------------------------------------------------------------
// Triggers immédiats
// -------------------------------------------------------------

/**
 * Exécute les règles ACTIVES d'un bien pour un trigger donné et
 * crée les notifications correspondantes. Jamais de throw.
 * Retourne le nombre de notifications créées (-1 si erreur).
 */
export async function runAutomationTrigger(
  propertyId: string,
  trigger: AutomationTrigger,
  ctx: AutomationCtx,
): Promise<number> {
  try {
    const rules = await db.automationRule.findMany({
      where: { propertyId, trigger, isActive: true },
      select: { id: true, key: true, action: true },
    });
    if (rules.length === 0) return 0;

    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { name: true },
    });
    const propertyName = property?.name ?? 'Votre bien';

    // 1 payload "porteuse" par KIND + règle : le message dépend
    // de l'audience (ex. BOOKING_CREATED → "Nouvelle réservation"
    // pour l'équipe, "Ménage à planifier" pour le ménage).
    const buildPayload = (ruleKey: string, ruleAction: string): NotificationPayload | null => {
      switch (ctx.kind) {
        case 'booking': {
          const b = ctx.booking;
          if (trigger === 'BOOKING_CREATED') {
            if (ruleAction === 'NOTIFY_CLEANERS') {
              return {
                type: 'host_cleaning',
                title: '🧹 Ménage à planifier',
                body: `${propertyName} : nouveau séjour de ${b.guestName} (départ le ${formatFrDate(b.checkOut)}) — ménage à prévoir.`,
              };
            }
            return {
              type: 'host_booking',
              title: '📅 Nouvelle réservation',
              body: `${propertyName} : séjour de ${b.guestName} du ${formatFrDate(b.checkIn)} au ${formatFrDate(b.checkOut)}.`,
            };
          }
          // CLEANING_DONE
          return {
            type: 'host_cleaning',
            title: '✨ Ménage terminé',
            body: `${propertyName} : le ménage après le séjour de ${b.guestName} est terminé.`,
          };
        }
        case 'maintenance': {
          const urgency =
            ctx.request.urgencyLevel && ctx.request.urgencyLevel !== 'normal'
              ? ` (urgence : ${ctx.request.urgencyLevel})`
              : '';
          return {
            type: 'host_maintenance',
            title: '🔧 Réclamation technique',
            body: `${propertyName} : ${ctx.request.description?.trim() || 'nouvelle demande de service'}${urgency}.`,
          };
        }
        case 'member':
          return {
            type: 'host_team',
            title: '👥 Équipe',
            body: `${ctx.member.displayName} a rejoint l’équipe de ${propertyName} en tant que ${memberRoleMeta(ctx.member.role).label}.`,
          };
        case 'order': {
          // ÉTAPE 17.3 — commande service depuis l'app invitée.
          const o = ctx.order;
          const amount = `${o.totalAmount.toFixed(2).replace('.', ',')} €`;
          return {
            type: 'host_order',
            title: '🥐 Nouvelle commande',
            body: `${propertyName} : ${o.guestName} a commandé « ${o.itemsSummary} » (${amount}) auprès de ${o.providerName}. À confirmer dans l’onglet Commandes.`,
          };
        }
        default:
          return null;
      }
    };

    const dataJson = JSON.stringify({
      propertyId,
      propertyName,
      trigger,
      bookingId: ctx.kind === 'booking' ? ctx.booking.id : undefined,
      requestId: ctx.kind === 'maintenance' ? ctx.request.id : undefined,
      orderId: ctx.kind === 'order' ? ctx.order.id : undefined, // ÉTAPE 17.3
      // Deep-link : une commande atterrit directement sur l'onglet Commandes.
      url: ctx.kind === 'order' ? '/airbnb/orders' : '/airbnb/dashboard',
    });

    let created = 0;
    for (const rule of rules) {
      const payload = buildPayload(rule.key, rule.action);
      if (!payload) continue;
      const audience = await resolveAudience(propertyId, rule.action as AutomationAction);
      // v5.20 — email/push filtrés selon les préférences de chaque destinataire
      created += await pushNotifications(
        audience,
        payload,
        dataJson,
        PREF_KEY_BY_TRIGGER[trigger],
      );
      await db.automationRule
        .update({ where: { id: rule.id }, data: { lastRunAt: new Date() } })
        .catch(() => undefined);
    }
    return created;
  } catch (error) {
    console.error('[automations] runAutomationTrigger failed:', error);
    return -1;
  }
}

// -------------------------------------------------------------
// Rappels quotidiens (évaluation lazy)
// -------------------------------------------------------------

const DAILY_TRIGGERS: AutomationTrigger[] = [
  'CHECK_IN_TODAY',
  'CHECK_OUT_TODAY',
  // AUDIT PRÉ-PROD (Module 5.3) — messages automatiques J-3 / J+1
  'CHECK_IN_J3',
  'CHECK_OUT_J1',
  'REVIEW_SHIELD_TODAY', // PREMIUM V5 — lien Bouclier d'avis aux départs du jour
];

/** Décalage en jours de la FENÊTRE DE RECHERCHE par rapport à AUJOURD'HUI. */
const TRIGGER_DAY_OFFSET: Record<string, number> = {
  CHECK_IN_TODAY: 0,
  CHECK_OUT_TODAY: 0,
  CHECK_IN_J3: 3,  // J-3 : le tick cherche les ARRIVÉES dans 3 jours
  CHECK_OUT_J1: -1, // J+1 : le tick cherche les DÉPARTS d'hier
};

/**
 * Tick lazy des rappels arrivée/départ du jour. À appeler à la
 * lecture (dashboard, automatisations, notifications). lastRunAt
 * garantit une seule évaluation par règle et par jour.
 * Retourne le nombre de notifications créées.
 */
export async function runDailyAutomations(propertyIds: string[]): Promise<number> {
  if (propertyIds.length === 0) return 0;
  let created = 0;
  try {
    const todayStart = startOfToday();
    const rules = await db.automationRule.findMany({
      where: {
        propertyId: { in: propertyIds },
        trigger: { in: DAILY_TRIGGERS },
        isActive: true,
        OR: [{ lastRunAt: null }, { lastRunAt: { lt: todayStart } }],
      },
      select: { id: true, propertyId: true, trigger: true, action: true },
    });

    for (const rule of rules) {
      // AUDIT PRÉ-PROD — marque le tick AVANT le traitement (sémantique
      // at-most-once) : deux ticks concurrents au 1er appel du jour ne
      // peuvent plus créer de doublons de notifications.
      await db.automationRule
        .update({ where: { id: rule.id }, data: { lastRunAt: new Date() } })
        .catch(() => undefined);

      // PREMIUM V5 — ⭐ Bouclier d'avis : SMS/email au voyageur qui
      // part aujourd'hui + récapitulatif à l'équipe.
      if (rule.trigger === 'REVIEW_SHIELD_TODAY') {
        created += await runReviewShieldForRule(rule);
        continue;
      }

      // AUDIT PRÉ-PROD — J-3 (pré-arrivée) / J+1 (post-départ, ménage) :
      // même mécanique d'évaluation lazy que Jour J, décalé de N jours.
      const offset = TRIGGER_DAY_OFFSET[rule.trigger];
      if (offset !== undefined && offset !== 0) {
        created += await runOffsetDayForRule(rule, offset);
        continue;
      }

      const isCheckIn = rule.trigger === 'CHECK_IN_TODAY';
      const bookings = await db.booking.findMany({
        where: {
          propertyId: rule.propertyId,
          status: { not: 'CANCELLED' },
          ...(isCheckIn
            ? { checkIn: { gte: todayStart, lte: endOfToday() } }
            : { checkOut: { gte: todayStart, lte: endOfToday() } }),
        },
        select: { id: true, guestName: true, guests: true },
      });

      if (bookings.length > 0) {
        const property = await db.property.findUnique({
          where: { id: rule.propertyId },
          select: { name: true },
        });
        const propertyName = property?.name ?? 'Votre bien';

        for (const booking of bookings) {
          const payload: NotificationPayload = isCheckIn
            ? {
                type: 'host_checkin',
                title: '🛬 Arrivée aujourd’hui',
                body: `${propertyName} : ${booking.guestName} arrive aujourd’hui (${booking.guests} pers.).`,
              }
            : {
                type: 'host_checkout',
                title: '🛫 Départ aujourd’hui',
                body: `${propertyName} : ${booking.guestName} part aujourd’hui — pensez au ménage.`,
              };
          const dataJson = JSON.stringify({
            propertyId: rule.propertyId,
            propertyName,
            trigger: rule.trigger,
            bookingId: booking.id,
            url: '/airbnb/dashboard',
          });
          const audience = await resolveAudience(
            rule.propertyId,
            rule.action as AutomationAction,
          );
          // v5.20 — rappels du matin : email/push filtrés par préférences
          created += await pushNotifications(
            audience,
            payload,
            dataJson,
            PREF_KEY_BY_TRIGGER[rule.trigger],
          );
        }
      }
    }
    return created;
  } catch (error) {
    console.error('[automations] runDailyAutomations failed:', error);
    return created;
  }
}

/**
 * AUDIT PRÉ-PROD — triggers décalés (J-3 pré-arrivée / J+1 post-départ).
 * offset = -3 : séJOURS dont checkIn est dans 3 jours ;
 * offset = +1 : séJOURS terminés hier (ménage non fait → tâche équipe).
 * Retourne le nombre de notifications créées. Jamais de throw.
 */
async function runOffsetDayForRule(
  rule: { id: string; propertyId: string; trigger: string; action: string },
  offset: number,
): Promise<number> {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() + offset);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const isPreArrival = offset > 0;
    const bookings = await db.booking.findMany({
      where: {
        propertyId: rule.propertyId,
        status: { not: 'CANCELLED' },
        ...(isPreArrival
          ? { checkIn: { gte: dayStart, lte: dayEnd } }
          : { checkOut: { gte: dayStart, lte: dayEnd } }),
      },
      select: {
        id: true,
        guestName: true,
        guests: true,
        ...(isPreArrival ? {} : { cleaningStatus: true }),
      },
    });
    if (bookings.length === 0) return 0;

    const property = await db.property.findUnique({
      where: { id: rule.propertyId },
      select: { name: true },
    });
    const propertyName = property?.name ?? 'Votre bien';
    let created = 0;

    for (const booking of bookings) {
      let payload: NotificationPayload;
      if (isPreArrival) {
        payload = {
          type: 'host_prearrival',
          title: '✉️ Arrivée dans 3 jours',
          body: `${propertyName} : ${booking.guestName} arrive le ${formatFrDate(dayStart)} (${booking.guests} pers.) — préparez le logement et envoyez les informations d'accès.`,
        };
      } else {
        const cleaningPending = (booking as { cleaningStatus?: string }).cleaningStatus === 'PENDING';
        payload = {
          type: 'host_cleaning_followup',
          title: cleaningPending ? '🧽 Ménage à faire (J+1)' : '✅ Ménage déjà fait',
          body: cleaningPending
            ? `${propertyName} : ${booking.guestName} est parti hier et le ménage est toujours « à faire » — planifiez-le aujourd'hui.`
            : `${propertyName} : séjour de ${booking.guestName} terminé, ménage déjà effectué. Rien à faire.`,
        };
      }
      const dataJson = JSON.stringify({
        propertyId: rule.propertyId,
        propertyName,
        trigger: rule.trigger,
        bookingId: booking.id,
        url: '/airbnb/dashboard',
      });
      // v5.20 — email/push filtrés par préférences (clé du trigger J-3/J+1)
      created += await pushNotifications(
        await resolveAudience(rule.propertyId, rule.action as AutomationAction),
        payload,
        dataJson,
        PREF_KEY_BY_TRIGGER[rule.trigger],
      );
    }
    return created;
  } catch (error) {
    console.error('[automations] runOffsetDayForRule failed:', error);
    return 0;
  }
}

// -------------------------------------------------------------
// PREMIUM V5 — ⭐ Bouclier d'avis au départ (REVIEW_SHIELD_TODAY)
// -------------------------------------------------------------

/** Échappe les caractères HTML d'un fragment texte (emails invité). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Envoie le lien du Bouclier d'avis aux départs du jour d'un bien :
 *   1. SMS prioritaire si `booking.guestPhone` est renseigné (Twilio,
 *      env-gated fail-closed — sans clés : no-op tracé).
 *   2. Sinon email si `booking.guestEmail` existe (outbox 'custom').
 *   3. Dans tous les cas, notification équipe (traçabilité ; et si
 *      aucun canal, message « envoyez-lui le lien manuellement »).
 *
 * LIEN TOKENISÉ (ÉTAPE 3.2) : chaque booking reçoit un
 * `feedbackToken` unique (généré paresseusement, idempotent) →
 *   /app/hub/[slug]/guest/feedback?token=…
 * Le lien ouvre DIRECTEMENT le Review Shield pré-rempli (nom, bien,
 * avis public) et rattache le retour privé au séjour (traçabilité,
 * anti-spam — token révocable en base).
 *
 * Gardes : règle active + Bouclier activé sur CE bien (premiumFeatures)
 * + bien possédant un Hub (qrHubSlug). Jamais de throw.
 */
async function runReviewShieldForRule(rule: {
  id: string;
  propertyId: string;
}): Promise<number> {
  try {
    const property = await db.property.findUnique({
      where: { id: rule.propertyId },
      select: {
        id: true,
        name: true,
        qrHubSlug: true,
        premiumFeatures: true,
        owner: { select: { id: true } },
      },
    });
    if (!property) return 0;

    // Garde métier : Bouclier activé + Hub Invité existant (jamais cru client).
    const premium = parsePremiumFeatures(property.premiumFeatures);
    if (!premium?.enableReviewShield || !property.qrHubSlug) return 0;

    // Départs du jour (hors annulés) — avec leurs canaux de contact.
    const bookings = await db.booking.findMany({
      where: {
        propertyId: property.id,
        status: { not: 'CANCELLED' },
        checkOut: { gte: startOfToday(), lte: endOfToday() },
      },
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        feedbackToken: true,
      },
    });
    if (bookings.length === 0) return 0;

    const hubUrl = `${siteUrl}/app/hub/${property.qrHubSlug}/guest`;
    let created = 0;

    for (const booking of bookings) {
      // ÉTAPE 3.2 — token unique du Bouclier (généré paresseusement,
      // idempotent : un départ relancé le même jour garde son lien).
      let feedbackToken = booking.feedbackToken;
      if (!feedbackToken) {
        feedbackToken = crypto.randomUUID().replace(/-/g, '');
        try {
          await db.booking.update({
            where: { id: booking.id },
            data: { feedbackToken },
          });
        } catch (error) {
          console.error('[automations] feedbackToken persist failed:', error);
          feedbackToken = null; // repli : lien Hub générique
        }
      }
      const shieldUrl = feedbackToken
        ? `${siteUrl}/app/hub/${property.qrHubSlug}/guest/feedback?token=${feedbackToken}`
        : hubUrl;

      const firstName = booking.guestName.trim().split(/\s+/)[0] || booking.guestName;
      const smsBody =
        `Bonjour ${firstName} ! C'est votre dernier jour à ${property.name} 🏡 ` +
        `Comment s'est passé votre séjour ? Donnez votre avis en 30 s : ${shieldUrl} À bientôt !`;

      // 1) SMS prioritaire (si téléphone E.164 renseigné et Twilio configuré)
      let channel: 'sms' | 'email' | 'none' = 'none';
      const phone = booking.guestPhone?.trim();
      if (phone) {
        const sms = await sendSms(phone, smsBody);
        if (sms.sent) channel = 'sms';
      }

      // 2) Fallback email (SMS absent/échoué + email présent)
      if (channel === 'none' && booking.guestEmail) {
        await queueEmail({
          to: booking.guestEmail,
          subject: `☀️ Bonjour ${firstName}, c'est votre dernier jour ! Votre avis sur ${property.name}`,
          html:
            `<p style="margin:0 0 12px">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>` +
            `<p style="margin:0 0 12px">☀️ C'est votre dernier jour à <strong>${escapeHtml(property.name)}</strong> — nous espérons que votre séjour a été parfait&nbsp;!</p>` +
            `<p style="margin:0 0 16px">Comment s'est passé votre séjour&nbsp;? Votre avis nous aide énormément :</p>` +
            `<p style="margin:0 0 16px"><a href="${shieldUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:12px;font-weight:700;text-decoration:none">⭐ Donner mon avis en 30 secondes</a></p>` +
            `<p style="margin:0;color:#64748b;font-size:13px">Si le bouton ne fonctionne pas : ${shieldUrl}</p>`,
          text: smsBody,
          template: 'custom',
          propertyId: property.id,
          referenceType: 'review_shield',
          referenceId: booking.id,
          meta: { trigger: 'REVIEW_SHIELD_TODAY', shieldUrl, feedbackToken },
        }).catch(() => undefined);
        channel = 'email';
      }

      // 3) Récapitulatif équipe (OWNER + MANAGER)
      const recap: NotificationPayload = {
        type: 'host_review_shield',
        title: '⭐ Demande d’avis au départ',
        body:
          `${property.name} : ${booking.guestName} part aujourd’hui — ` +
          (channel === 'sms'
            ? 'le lien du Bouclier d’avis vient de lui être envoyé par SMS.'
            : channel === 'email'
              ? 'le lien du Bouclier d’avis vient de lui être envoyé par email.'
              : 'aucun téléphone/email sur la réservation — envoyez-lui le lien manuellement depuis le Hub.'),
      };
      const dataJson = JSON.stringify({
        propertyId: property.id,
        propertyName: property.name,
        trigger: 'REVIEW_SHIELD_TODAY',
        bookingId: booking.id,
        shieldUrl,
        hubUrl,
        channel,
        url: `/app/hub/${property.qrHubSlug}/guest`,
      });
      // v5.20 — récap hôte filtré par la préférence 'review_shield_today'
      // (l'envoi au VOYAGEUR ci-dessus n'est jamais affecté par les prefs)
      created += await pushNotifications(
        await resolveAudience(property.id, 'NOTIFY_OWNERS'),
        recap,
        dataJson,
        PREF_KEY_BY_TRIGGER['REVIEW_SHIELD_TODAY'],
      );
    }
    return created;
  } catch (error) {
    console.error('[automations] runReviewShieldForRule failed:', error);
    return 0;
  }
}

/**
 * v5.20 — RÉSERVATIONS ICAL (lacune d'audit) : les séjours importés
 * d'un calendrier (Airbnb, Booking.com, Abritel…) étaient muets —
 * l'hôte les découvrait seulement en ouvrant le planning.
 *
 * Après CHAQUE synchronisation ayant CRÉÉ des séjours, un récap
 * part vers l'hôte et ses managers (in-app + email + push VAPID,
 * filtrés par la préférence 'booking_created' — le catalogue
 * annonce déjà « manuel, OTA ou iCal ») :
 *  - 1 séjour → message individuel (même style que BOOKING_CREATED) ;
 *  - N séjours → UN SEUL récapitulatif groupé (anti-spam, même un
 *    premier import de 30 événements) ; les mises à jour de séjours
 *    déjà connus ne déclenchent jamais de relance.
 * Deep-link : /airbnb/calendar. Ne lève jamais.
 */
export async function notifyIcalImport(
  propertyId: string,
  created: IcalCreatedBooking[],
): Promise<number> {
  try {
    if (created.length === 0) return 0;
    const [property, audience] = await Promise.all([
      db.property.findUnique({ where: { id: propertyId }, select: { name: true } }),
      propertyOwnerAndManagers(propertyId),
    ]);
    if (audience.length === 0) return 0;
    const propertyName = property?.name ?? 'Votre bien';

    const sorted = [...created].sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    let title: string;
    let body: string;
    if (created.length === 1) {
      title = '📅 Nouvelle réservation importée';
      body =
        `${propertyName} : séjour de ${first.guestName} ` +
        `du ${formatFrDate(first.checkIn)} au ${formatFrDate(first.checkOut)} — ` +
        'importé depuis votre calendrier iCal.';
    } else {
      title = `📅 ${created.length} nouvelles réservations importées`;
      const lines = sorted
        .slice(0, 5)
        .map(
          (b) =>
            `• ${b.guestName} — du ${formatFrDate(b.checkIn)} au ${formatFrDate(b.checkOut)}`,
        );
      if (sorted.length > 5) lines.push(`• … et ${sorted.length - 5} autres séjours`);
      body =
        `${propertyName} : ${created.length} séjours ont été ajoutés au planning ` +
        `depuis votre calendrier iCal (${formatFrDate(first.checkIn)} → ${formatFrDate(last.checkOut)}) :\n` +
        lines.join('\n');
    }

    const dataJson = JSON.stringify({
      propertyId,
      propertyName,
      trigger: 'ICAL_IMPORT',
      bookingIds: created.map((b) => b.id),
      url: '/airbnb/calendar',
    });
    return await pushNotifications(
      audience,
      { type: 'host_booking', title, body },
      dataJson,
      'booking_created',
    );
  } catch (error) {
    console.error('[automations] notifyIcalImport failed:', error);
    return 0;
  }
}

/** Tick pour tous les biens accessibles d'un utilisateur (session-scoped). */
export async function runDailyAutomationsForUser(userId: string): Promise<number> {
  try {
    const [owned, memberships] = await Promise.all([
      db.property.findMany({ where: { ownerId: userId }, select: { id: true } }),
      db.propertyMember.findMany({
        where: { userId, acceptedAt: { not: null } },
        select: { propertyId: true },
      }),
    ]);
    const ids = Array.from(new Set([...owned.map((p) => p.id), ...memberships.map((m) => m.propertyId)]));
    return await runDailyAutomations(ids);
  } catch (error) {
    console.error('[automations] runDailyAutomationsForUser failed:', error);
    return 0;
  }
}

// -------------------------------------------------------------
// ÉTAPE 3.2 — checkDailyAutomations() — tick GLOBAL (cron)
// -------------------------------------------------------------

export interface DailyAutomationsReport {
  propertiesChecked: number;
  notificationsCreated: number;
  /** AUDIT PRÉ-PROD — CRON iCal : feeds synchronisés ce tick (throttle 1 h). */
  feedsSynced?: number;
  durationMs: number;
}

/**
 * Tick global des automatisations du jour, sur TOUS les biens actifs
 * possédant au moins une règle active. Appelé par :
 *  - POST /api/admin/trigger-daily-automations (cron externe —
 *    Cron-job.org, Coolify scheduled task…) — Bearer CRON_SECRET ;
 *  - un superadmin depuis la Console (test manuel).
 *
 * lastRunAt garantit une exécution réelle UNE fois par jour et par
 * règle : appeler la route plusieurs fois par jour est donc sûr
 * (idempotent) et sert de « rattrapage » si le cron a raté.
 */
export async function checkDailyAutomations(): Promise<DailyAutomationsReport> {
  const startedAt = Date.now();
  let propertiesChecked = 0;
  try {
    // AUDIT PRÉ-PROD — déploie les NOUVELLES règles du catalogue (J-3 /
    // J+1) sur tous les biens actifs existants (idempotent : filtre les
    // clés déjà présentes), puis tick des rappels du jour.
    try {
      const activeProps = await db.property.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      await Promise.all(activeProps.map((p) => ensureDefaultRules(p.id)));
    } catch (error) {
      console.error('[automations] catalogue deployment failed:', error);
    }

    // AUDIT PRÉ-PROD — CRON iCal : synchronise tous les feeds dus
    // (lastSyncAt > 1 h) — appelé par le cron externe (Cron-job.org
    // hourly) ou le tick lazy. Throttle 1 h par feed.
    let feedsSynced = 0;
    try {
      feedsSynced = await syncDueIcalFeeds();
    } catch (error) {
      console.error('[automations] ical sync failed:', error);
    }

    const rules = await db.automationRule.findMany({
      where: { isActive: true },
      select: { propertyId: true },
    });
    const propertyIds = Array.from(new Set(rules.map((r) => r.propertyId)));
    propertiesChecked = propertyIds.length;
    const created = await runDailyAutomations(propertyIds);
    return {
      propertiesChecked,
      notificationsCreated: Math.max(created, 0),
      feedsSynced,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    console.error('[automations] checkDailyAutomations failed:', error);
    return { propertiesChecked, notificationsCreated: 0, feedsSynced: 0, durationMs: Date.now() - startedAt };
  }
}

/**
 * AUDIT PRÉ-PROD — CRON iCal (Module 3.5) : synchronise chaque feed
 * dont la dernière synchro date de plus d'1 h (ou jamais). Télécharge
 * le calendrier, parse les VEVENT et upsert les Bookings (idempotent,
 * source 'ICAL'). Retourne le nombre de feeds traités. Jamais de throw.
 */
const ICAL_SYNC_THROTTLE_MS = 60 * 60 * 1000;

export async function syncDueIcalFeeds(): Promise<number> {
  // AUDIT 24-c (P1) — EXPORTÉE : le tick lazy du dashboard
  // (/api/airbnb/automations GET) l'appelle en fire-and-forget pour que
  // les calendriers iCal se resynchronisent MÊME sans cron externe
  // (throttle interne : chaque feed n'est relu qu'au-delà d'1 h).
  try {
    const cutoff = new Date(Date.now() - ICAL_SYNC_THROTTLE_MS);
    const feeds = await db.propertyIcalFeed.findMany({
      where: { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }] },
      select: { id: true, url: true, propertyId: true },
      take: 50, // garde-fou : 50 feeds max par tick
    });

    let synced = 0;
    for (const feed of feeds) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        let imported = 0;
        let createdBookings: IcalCreatedBooking[] = [];
        let lastError: string | null = null;
        try {
          const res = await fetch(feed.url, {
            signal: controller.signal,
            headers: { Accept: 'text/calendar, text/plain, */*' },
            cache: 'no-store',
          });
          if (res.ok) {
            const content = await res.text();
            const { events, error } = parseIcalEvents(content);
            if (error) {
              lastError = error;
            } else {
              // v5.20 — l'upsert retourne aussi les séjours CRÉÉS
              const up = await db.$transaction((tx) =>
                upsertIcalBookings(tx, feed.propertyId, events),
              );
              imported = up.written;
              createdBookings = up.created;
            }
          } else {
            lastError = `HTTP ${res.status}`;
          }
        } finally {
          clearTimeout(timeout);
        }
        await db.propertyIcalFeed.update({
          where: { id: feed.id },
          data: {
            lastSyncAt: new Date(),
            lastStatus: lastError ? 'ERROR' : 'OK',
            lastError,
            lastImported: imported,
          },
        });
        // v5.20 — LACUNE D'AUDIT corrigée : l'hôte est informé des
        // nouveaux séjours (1 récap par sync ; mises à jour muettes).
        if (createdBookings.length > 0) {
          await notifyIcalImport(feed.propertyId, createdBookings);
        }
        synced++;
      } catch (error) {
        // Feed injoignable : trace + horodatage (retry au prochain tick)
        await db.propertyIcalFeed
          .update({
            where: { id: feed.id },
            data: {
              lastSyncAt: new Date(),
              lastStatus: 'ERROR',
              lastError: error instanceof Error ? error.message.slice(0, 200) : 'erreur réseau',
            },
          })
          .catch(() => undefined);
      }
    }
    return synced;
  } catch (error) {
    console.error('[automations] syncDueIcalFeeds failed:', error);
    return 0;
  }
}

// Re-export utilitaire pour les routes (évite les imports croisés)
export { toIso as bookingDateToIso };
