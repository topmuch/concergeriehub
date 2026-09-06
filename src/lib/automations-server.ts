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
// FIX-12 — rendu DB-first : le modèle éditable /admin/emails → Modèles
// est lu en priorité, fallback silencieux sur le template codé en dur.
import { renderHostNotificationEmail } from '@/lib/email-template-render';

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

/**
 * ÉTAPE 22 — Miroir email des notifications : chaque destinataire
 * d'une notification d'équipe reçoit aussi un email (même contenu,
 * template générique). Fire-and-forget : ne lève jamais, n'échoue
 * jamais le flux appelant.
 */
async function emailMirror(
  userIds: string[],
  payload: NotificationPayload,
  dataJson: string,
): Promise<void> {
  try {
    if (userIds.length === 0) return;
    let parsed: { propertyName?: string; url?: string; propertyId?: string; trigger?: string } = {};
    try {
      parsed = JSON.parse(dataJson);
    } catch {
      return;
    }
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    });
    const propertyName = parsed.propertyName ?? 'Votre bien';
    for (const user of users) {
      if (!user.email) continue;
      const tpl = await renderHostNotificationEmail({
        title: payload.title,
        body: payload.body,
        propertyName,
        url: parsed.url,
      });
      await queueEmail({
        to: user.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        template: 'host_notification',
        userId: user.id,
        propertyId: parsed.propertyId ?? null,
        referenceType: 'automation',
        meta: { trigger: parsed.trigger, notificationType: payload.type },
      });
    }
  } catch (error) {
    console.error('[automations] emailMirror failed:', error);
  }
}

/** Crée les notifications (dédupliqué) + miroir email. Ne lève jamais. */
async function pushNotifications(
  userIds: string[],
  payload: NotificationPayload,
  dataJson: string,
): Promise<number> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return 0;
  try {
    const result = await db.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        dataJson,
      })),
    });
    // ÉTAPE 22 — miroir email (best-effort, jamais bloquant)
    await emailMirror(unique, payload, dataJson);
    return result.count;
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
      created += await pushNotifications(audience, payload, dataJson);
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

const DAILY_TRIGGERS: AutomationTrigger[] = ['CHECK_IN_TODAY', 'CHECK_OUT_TODAY'];

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
          created += await pushNotifications(audience, payload, dataJson);
        }
      }

      // Marquer le tick du jour même sans séjour (évite de re-scanner)
      await db.automationRule
        .update({ where: { id: rule.id }, data: { lastRunAt: new Date() } })
        .catch(() => undefined);
    }
    return created;
  } catch (error) {
    console.error('[automations] runDailyAutomations failed:', error);
    return created;
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

// Re-export utilitaire pour les routes (évite les imports croisés)
export { toIso as bookingDateToIso };
