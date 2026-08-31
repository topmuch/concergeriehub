// =============================================================
// MOTEUR D'AUTOMATISATIONS — ÉTAPE 13 V2 (server-only)
// NE PAS importer côté client (dépend de la DB).
//
// - ensureDefaultRules(propertyId)  : déploie le catalogue sur un bien
// - runAutomationTrigger(...)       : exécute les règles immédiates
//   (BOOKING_CREATED, CLEANING_DONE, MAINTENANCE_REQUESTED,
//    MEMBER_ACCEPTED)
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

export type AutomationCtx =
  | { kind: 'booking'; booking: BookingCtx }
  | { kind: 'maintenance'; request: MaintenanceCtx }
  | { kind: 'member'; member: MemberCtx };

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

/** Crée les notifications (dédupliqué). Ne lève jamais. */
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
    return result.count;
  } catch (error) {
    console.error('[automations] pushNotifications failed:', error);
    return 0;
  }
}

// -------------------------------------------------------------
// Déploiement du catalogue
// -------------------------------------------------------------

/** Crée les règles manquantes du catalogue pour un bien (idempotent). */
export async function ensureDefaultRules(propertyId: string): Promise<void> {
  try {
    await db.automationRule.createMany({
      data: AUTOMATIONS_CATALOG.map((m) => ({
        propertyId,
        key: m.key,
        trigger: m.trigger,
        action: m.action,
        isActive: true,
      })),
      skipDuplicates: true,
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

    // 1 notification "porteuse" construite depuis le contexte
    let payload: NotificationPayload;
    switch (ctx.kind) {
      case 'booking': {
        const b = ctx.booking;
        if (trigger === 'BOOKING_CREATED') {
          payload = {
            type: 'host_booking',
            title: '📅 Nouvelle réservation',
            body: `${propertyName} : séjour de ${b.guestName} du ${formatFrDate(b.checkIn)} au ${formatFrDate(b.checkOut)}.`,
          };
        } else {
          // CLEANING_DONE
          payload = {
            type: 'host_cleaning',
            title: '✨ Ménage terminé',
            body: `${propertyName} : le ménage après le séjour de ${b.guestName} est terminé.`,
          };
        }
        break;
      }
      case 'maintenance': {
        const urgency =
          ctx.request.urgencyLevel && ctx.request.urgencyLevel !== 'normal'
            ? ` (urgence : ${ctx.request.urgencyLevel})`
            : '';
        payload = {
          type: 'host_maintenance',
          title: '🔧 Réclamation technique',
          body: `${propertyName} : ${ctx.request.description?.trim() || 'nouvelle demande de service'}${urgency}.`,
        };
        break;
      }
      case 'member': {
        payload = {
          type: 'host_team',
          title: '👥 Équipe',
          body: `${ctx.member.displayName} a rejoint l’équipe de ${propertyName} en tant que ${memberRoleMeta(ctx.member.role).label}.`,
        };
        break;
      }
      default:
        return 0;
    }

    const dataJson = JSON.stringify({
      propertyId,
      propertyName,
      trigger,
      bookingId: ctx.kind === 'booking' ? ctx.booking.id : undefined,
      requestId: ctx.kind === 'maintenance' ? ctx.request.id : undefined,
      url: '/airbnb/dashboard',
    });

    let created = 0;
    for (const rule of rules) {
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
