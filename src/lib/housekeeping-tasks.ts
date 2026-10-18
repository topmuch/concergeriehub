// =============================================================
// v4.96 « MÉNAGE — INTERVENTIONS PLANIFIÉES » (lib serveur)
//
// Le ménage est le cœur du business de l'hôte : chaque séjour
// CONFIRMÉ génère AUTOMATIQUEMENT une intervention (HousekeepingTask)
// au créneau situé ENTRE le check-out du séjour et le check-in du
// séjour suivant sur le même bien.
//
// Conventions horaires (iCal souvent ambigu) :
//   • check-out « 00:00 »  → départ réel estimé à 10:00 le même jour ;
//   • check-in  « 00:00 »  → arrivée réelle estimée à 15:00 le même jour.
// Si aucun séjour suivant n'est connu : créneau par défaut de 4 h.
//
// Synchronisation (une seule source de vérité) :
//   • la validation du rapport staff dans le Hub (route /cleaning)
//     clôture la tâche (DONE) et bascule Booking.cleaningStatus = DONE ;
//   • l'hôte peut aussi clôturer manuellement depuis le planning.
// =============================================================
import { db } from '@/lib/db';

/** Fenêtre de rattrapage : on (re)génère les tâches des séjours dont
 *  le check-out n'est pas plus ancien que ce nombre de jours. */
const BACKFILL_DAYS = 10;
/** Horizon de planification maximal (séjours très lointains inclus). */
const HORIZON_DAYS = 400;
/** Créneau par défaut (h) quand aucun séjour suivant n'est connu. */
const DEFAULT_WINDOW_HOURS = 4;

/** Check-out « effectif » : minuit (00:00, convention iCal) → 10:00. */
export function effectiveCheckOut(raw: Date): Date {
  const d = new Date(raw);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    d.setUTCHours(10, 0, 0, 0);
  }
  return d;
}

/** Check-in « effectif » : minuit (00:00, convention iCal) → 15:00. */
export function effectiveCheckIn(raw: Date): Date {
  const d = new Date(raw);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    d.setUTCHours(15, 0, 0, 0);
  }
  return d;
}

/**
 * Génère les interventions manquantes pour les biens donnés
 * (idempotent : ne crée QUE les tâches absentes, n'écrase jamais
 * une tâche déjà décalée/assignée/clôturée par l'hôte).
 * @returns le nombre de tâches créées.
 */
export async function ensureHousekeepingTasksForProperties(
  propertyIds: string[],
): Promise<number> {
  if (propertyIds.length === 0) return 0;
  const now = new Date();
  const from = new Date(now.getTime() - BACKFILL_DAYS * 86_400_000);
  const to = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

  // Séjours à couvrir (tout sauf annulés), triés par départ.
  const bookings = await db.booking.findMany({
    where: {
      propertyId: { in: propertyIds },
      status: { not: 'CANCELLED' },
      checkOut: { gte: from, lte: to },
    },
    select: {
      id: true,
      propertyId: true,
      checkIn: true,
      checkOut: true,
    },
    orderBy: { checkOut: 'asc' },
  });
  if (bookings.length === 0) return 0;

  // Tâches déjà existantes → on ne crée que les manquantes.
  const existingBookingIds = new Set(
    (
      await db.housekeepingTask.findMany({
        where: { propertyId: { in: propertyIds }, bookingId: { not: null } },
        select: { bookingId: true },
      })
    )
      .map((t) => t.bookingId)
      .filter((id): id is string => typeof id === 'string'),
  );

  // Arrivées suivantes (pour borner le créneau) : toutes les check-ins
  // postérieures au départ, par bien — première = séjour suivant.
  const checkIns = await db.booking.findMany({
    where: {
      propertyId: { in: propertyIds },
      status: { not: 'CANCELLED' },
      checkIn: { gte: from, lte: to },
    },
    select: { propertyId: true, checkIn: true },
    orderBy: { checkIn: 'asc' },
  });

  const toCreate: {
    propertyId: string;
    bookingId: string;
    scheduledAt: Date;
    scheduledEndAt: Date;
  }[] = [];

  for (const b of bookings) {
    if (existingBookingIds.has(b.id)) continue;
    const start = effectiveCheckOut(b.checkOut);
    const nextCheckIn = checkIns.find(
      (c) => c.propertyId === b.propertyId && c.checkIn.getTime() > b.checkOut.getTime(),
    );
    let end: Date;
    if (nextCheckIn) {
      const effective = effectiveCheckIn(nextCheckIn.checkIn);
      end = effective.getTime() > start.getTime()
        ? effective
        : new Date(start.getTime() + 2 * 3_600_000); // back-to-back : express 2 h
    } else {
      end = new Date(start.getTime() + DEFAULT_WINDOW_HOURS * 3_600_000);
    }
    toCreate.push({
      propertyId: b.propertyId,
      bookingId: b.id,
      scheduledAt: start,
      scheduledEndAt: end,
    });
  }

  if (toCreate.length === 0) return 0;
  await db.housekeepingTask.createMany({ data: toCreate });
  return toCreate.length;
}

/** Version mono-bien (confort d'appel à la création d'un séjour). */
export async function ensureHousekeepingTasksForProperty(
  propertyId: string,
): Promise<number> {
  return ensureHousekeepingTasksForProperties([propertyId]);
}

/**
 * Clôture automatique depuis la validation du rapport staff (Hub).
 * Prend la tâche NON terminée la plus récemment échue du bien
 * (créneau ≤ maintenant + 12 h), la passe DONE avec les heures
 * réelles du rapport et bascule Booking.cleaningStatus = 'DONE'.
 * @returns { taskId, bookingId } ou null si aucune tâche à clôturer.
 */
export async function completeHousekeepingTaskFromReport(params: {
  propertyId: string;
  reportId: string;
  startedAt: Date | null;
  endedAt: Date | null;
}): Promise<{ taskId: string; bookingId: string | null } | null> {
  const { propertyId, reportId, startedAt, endedAt } = params;
  const now = new Date();
  const candidate = await db.housekeepingTask.findFirst({
    where: {
      propertyId,
      status: { not: 'DONE' },
      scheduledAt: { lte: new Date(now.getTime() + 12 * 3_600_000) },
    },
    orderBy: { scheduledAt: 'desc' },
  });
  if (!candidate) return null;

  const ended = endedAt ?? now;
  await db.housekeepingTask.update({
    where: { id: candidate.id },
    data: {
      status: 'DONE',
      startedAt: candidate.startedAt ?? startedAt ?? now,
      endedAt: candidate.endedAt ?? ended,
      reportId,
    },
  });
  if (candidate.bookingId) {
    await db.booking.updateMany({
      where: { id: candidate.bookingId },
      data: { cleaningStatus: 'DONE' },
    });
  }
  return { taskId: candidate.id, bookingId: candidate.bookingId };
}
