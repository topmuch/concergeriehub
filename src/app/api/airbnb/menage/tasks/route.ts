// =============================================================
// v4.96 « MÉNAGE — INTERVENTIONS PLANIFIÉES » — /api/airbnb/menage/tasks
//
// Planning des interventions de ménage (HousekeepingTask) générées
// automatiquement entre le check-out d'un séjour et le check-in du
// séjour suivant (lib : src/lib/housekeeping-tasks.ts).
//
// GET ?propertyId=<id|all> : interventions des biens accessibles
//        (session obligatoire) + membres de l'équipe assignables +
//        horloge serveur. Rattrapage (backfill idempotent) des
//        interventions manquantes AVANT la lecture (jamais bloquant).
// POST : création d'une intervention ad-hoc (ex. grand nettoyage
//        de printemps, intervention hors séjour). bookingId = null.
// PATCH : actions sur une intervention —
//          start    → IN_PROGRESS (horodatage début réel) ;
//          done     → DONE + Booking.cleaningStatus = 'DONE' ;
//          reopen   → PENDING (heures + rapport effacés) ;
//          postpone → déplace le créneau (scheduledAt[/EndAt]) ;
//          assign   → (ré)assigne ou retire l'assignataire.
//
// Sécurité : périmètre recalculé SERVEUR via resolveUserProperties
// (propriétaire + memberships acceptés) — zéro accès aux biens hors
// périmètre (403), tâche introuvable (404), payload invalide (400,
// messages FR clairs).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';
import { normalizeMemberRole } from '@/lib/team';
import { ensureHousekeepingTasksForProperties } from '@/lib/housekeeping-tasks';

// -------------------------------------------------------------
// Sécurité (même pattern assertOwnedProperty que /api/airbnb/menage)
// -------------------------------------------------------------

/** Résout le périmètre de l'utilisateur : ids des biens accessibles
 *  (owner OU membership accepté) + noms (propertyName sans re-query). */
async function resolveScope(userId: string): Promise<{
  ids: string[];
  names: Map<string, string>;
} | null> {
  const properties = await resolveUserProperties(userId);
  if (properties.length === 0) return null;
  return {
    ids: properties.map((p) => p.id),
    names: new Map(properties.map((p) => [p.id, p.name])),
  };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/;

/** Parse strict d'une date ISO (string) → Date valide ou null. */
function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length < 10 || !ISO_DATE_RE.test(value)) {
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// -------------------------------------------------------------
// Sérialisation commune (même forme en GET/POST/PATCH)
// -------------------------------------------------------------

/** Include Prisma commun : séjour lié (invité + dates) et assignataire
 *  (nom complet / email) pour construire la réponse du planning. */
const taskInclude = {
  booking: { select: { guestName: true, checkIn: true, checkOut: true } },
  assignee: { select: { fullName: true, email: true } },
} satisfies Prisma.HousekeepingTaskInclude;

type TaskWithMeta = Prisma.HousekeepingTaskGetPayload<{ include: typeof taskInclude }>;

function serializeTask(
  task: TaskWithMeta,
  names: Map<string, string>,
): Record<string, unknown> {
  return {
    id: task.id,
    propertyId: task.propertyId,
    propertyName: names.get(task.propertyId) ?? null,
    bookingId: task.bookingId,
    guestName: task.booking?.guestName ?? null,
    checkIn: task.booking?.checkIn?.toISOString() ?? null,
    checkOut: task.booking?.checkOut?.toISOString() ?? null,
    scheduledAt: task.scheduledAt.toISOString(),
    scheduledEndAt: task.scheduledEndAt?.toISOString() ?? null,
    status: task.status,
    startedAt: task.startedAt?.toISOString() ?? null,
    endedAt: task.endedAt?.toISOString() ?? null,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.fullName ?? task.assignee?.email ?? null,
    reportId: task.reportId,
    note: task.note,
    createdAt: task.createdAt.toISOString(),
  };
}

/** Poids de tri des membres : CLEANER d'abord (ce sont eux qu'on
 *  assigne le plus souvent), puis MANAGER / OWNER / MAINTENANCE. */
const MEMBER_ROLE_WEIGHT: Record<string, number> = {
  CLEANER: 0,
  MANAGER: 1,
  OWNER: 2,
  MAINTENANCE: 3,
};

// -------------------------------------------------------------
// GET — planning + membres assignables + horloge serveur
// -------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const scope = await resolveScope(userId);
    if (!scope) {
      // Aucun bien accessible → réponse vide mais 200 (même contrat
      // que /api/airbnb/menage).
      return NextResponse.json({
        tasks: [],
        members: [],
        serverTime: new Date().toISOString(),
      });
    }
    const { ids, names } = scope;

    // Rattrapage idempotent : (re)génère les interventions manquantes
    // des séjours confirmés — JAMAIS bloquant (échec → log + suite).
    try {
      await ensureHousekeepingTasksForProperties(ids);
    } catch (error) {
      console.error('[airbnb/menage/tasks GET] Backfill error:', error);
    }

    // Interventions : créneaux à partir de maintenant - 14 jours
    // (l'historique récent reste visible), tri croissant, plafond 300.
    const from = new Date(Date.now() - 14 * 86_400_000);
    const tasks = await db.housekeepingTask.findMany({
      where: { propertyId: { in: ids }, scheduledAt: { gte: from } },
      orderBy: { scheduledAt: 'asc' },
      take: 300,
      include: taskInclude,
    });

    // Membres assignables : PropertyMember acceptés des biens visibles,
    // dédupliqués par utilisateur (un membre peut être sur plusieurs
    // biens), rôle canonique (mapping legacy), CLEANER en tête.
    const memberRows = await db.propertyMember.findMany({
      where: { propertyId: { in: ids }, acceptedAt: { not: null } },
      select: {
        userId: true,
        role: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
    const byUser = new Map<string, { id: string; name: string; email: string; role: string }>();
    for (const m of memberRows) {
      if (!m.user || byUser.has(m.userId)) continue;
      byUser.set(m.userId, {
        id: m.user.id,
        name: m.user.fullName ?? m.user.email,
        email: m.user.email,
        role: normalizeMemberRole(m.role),
      });
    }
    const members = Array.from(byUser.values()).sort((a, b) => {
      const w = (MEMBER_ROLE_WEIGHT[a.role] ?? 9) - (MEMBER_ROLE_WEIGHT[b.role] ?? 9);
      return w !== 0 ? w : a.name.localeCompare(b.name, 'fr');
    });

    return NextResponse.json({
      tasks: tasks.map((t) => serializeTask(t, names)),
      members,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[airbnb/menage/tasks GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// -------------------------------------------------------------
// POST — création d'une intervention ad-hoc (bookingId = null)
// -------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      propertyId?: unknown;
      scheduledAt?: unknown;
      scheduledEndAt?: unknown;
      assigneeId?: unknown;
      note?: unknown;
    } | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    // propertyId : id réel obligatoire ('all' interdit en création).
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : '';
    if (!propertyId || propertyId === 'all') {
      return NextResponse.json(
        { error: 'Sélectionnez d’abord un bien précis pour créer une intervention.' },
        { status: 400 },
      );
    }

    // Périmètre recalculé serveur — zéro accès hors biens accessibles.
    const scope = await resolveScope(userId);
    if (!scope || !scope.ids.includes(propertyId)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // scheduledAt : ISO valide obligatoire.
    const scheduledAt = parseIsoDate(body.scheduledAt);
    if (!scheduledAt) {
      return NextResponse.json(
        { error: 'Date d’intervention invalide (format ISO attendu).' },
        { status: 400 },
      );
    }

    // scheduledEndAt : optionnel, ISO valide, STRICTEMENT après le début.
    let scheduledEndAt: Date | null = null;
    if (
      body.scheduledEndAt !== undefined &&
      body.scheduledEndAt !== null &&
      body.scheduledEndAt !== ''
    ) {
      const end = parseIsoDate(body.scheduledEndAt);
      if (!end) {
        return NextResponse.json(
          { error: 'Heure de fin invalide (format ISO attendu).' },
          { status: 400 },
        );
      }
      if (end.getTime() <= scheduledAt.getTime()) {
        return NextResponse.json(
          { error: 'L’heure de fin doit être après le début de l’intervention.' },
          { status: 400 },
        );
      }
      scheduledEndAt = end;
    }

    // assigneeId : optionnel — l'utilisateur doit exister (User).
    let assigneeId: string | null = null;
    if (typeof body.assigneeId === 'string' && body.assigneeId.trim()) {
      const candidate = body.assigneeId.trim();
      const exists = await db.user.findUnique({
        where: { id: candidate },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ error: 'Membre assigné introuvable.' }, { status: 400 });
      }
      assigneeId = candidate;
    }

    // note : optionnelle, plafonnée pour rester lisible dans le planning.
    let note: string | null = null;
    if (typeof body.note === 'string' && body.note.trim()) {
      note = body.note.trim().slice(0, 500);
    }

    const created = await db.housekeepingTask.create({
      data: {
        propertyId,
        bookingId: null, // intervention ad-hoc : jamais rattachée à un séjour
        scheduledAt,
        scheduledEndAt,
        assigneeId,
        note,
        status: 'PENDING',
      },
      include: taskInclude,
    });

    return NextResponse.json({ task: serializeTask(created, scope.names) }, { status: 201 });
  } catch (error) {
    console.error('[airbnb/menage/tasks POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// -------------------------------------------------------------
// PATCH — actions sur une intervention existante
// -------------------------------------------------------------
const TASK_ACTIONS = ['start', 'done', 'reopen', 'postpone', 'assign'] as const;
type TaskAction = (typeof TASK_ACTIONS)[number];

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      taskId?: unknown;
      action?: unknown;
      scheduledAt?: unknown;
      scheduledEndAt?: unknown;
      assigneeId?: unknown;
    } | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
    if (!taskId) {
      return NextResponse.json({ error: 'Identifiant d’intervention requis.' }, { status: 400 });
    }
    const action = body.action as TaskAction;
    if (!TASK_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: 'Action inconnue (start, done, reopen, postpone ou assign attendus).' },
        { status: 400 },
      );
    }

    // La tâche doit exister ET appartenir à un bien du périmètre.
    const existing = await db.housekeepingTask.findUnique({
      where: { id: taskId },
      select: { id: true, propertyId: true, status: true, bookingId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Intervention introuvable.' }, { status: 404 });
    }
    const scope = await resolveScope(userId);
    if (!scope || !scope.ids.includes(existing.propertyId)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const now = new Date();
    let data: Record<string, unknown> = {};

    switch (action) {
      case 'start': {
        // Une intervention clôturée ne repart pas sans 'reopen'.
        if (existing.status === 'DONE') {
          return NextResponse.json(
            {
              error:
                'Cette intervention est déjà terminée. Réouvrez-la avant de la relancer.',
            },
            { status: 400 },
          );
        }
        data = { status: 'IN_PROGRESS', startedAt: now };
        break;
      }
      case 'done': {
        data = { status: 'DONE', endedAt: now };
        break;
      }
      case 'reopen': {
        // Retour en attente : heures réelles + rapport effacés.
        data = { status: 'PENDING', startedAt: null, endedAt: null, reportId: null };
        break;
      }
      case 'postpone': {
        // Nouveau créneau : scheduledAt obligatoire, end optionnel > début.
        const scheduledAt = parseIsoDate(body.scheduledAt);
        if (!scheduledAt) {
          return NextResponse.json(
            { error: 'Nouvelle date d’intervention invalide (format ISO attendu).' },
            { status: 400 },
          );
        }
        let endProvided = false;
        let scheduledEndAt: Date | null = null;
        if (body.scheduledEndAt !== undefined) {
          endProvided = true;
          if (body.scheduledEndAt !== null && body.scheduledEndAt !== '') {
            const end = parseIsoDate(body.scheduledEndAt);
            if (!end) {
              return NextResponse.json(
                { error: 'Heure de fin invalide (format ISO attendu).' },
                { status: 400 },
              );
            }
            if (end.getTime() <= scheduledAt.getTime()) {
              return NextResponse.json(
                { error: 'L’heure de fin doit être après le début de l’intervention.' },
                { status: 400 },
              );
            }
            scheduledEndAt = end;
          } // sinon : fin explicite vidée (null)
        }
        data = {
          scheduledAt,
          ...(endProvided ? { scheduledEndAt } : {}),
        };
        break;
      }
      case 'assign': {
        // assigneeId : string (User existant) ou null (désassignation).
        if (body.assigneeId === null) {
          data = { assigneeId: null };
        } else if (typeof body.assigneeId === 'string') {
          const candidate = body.assigneeId.trim();
          if (!candidate) {
            data = { assigneeId: null };
          } else {
            const exists = await db.user.findUnique({
              where: { id: candidate },
              select: { id: true },
            });
            if (!exists) {
              return NextResponse.json(
                { error: 'Membre assigné introuvable.' },
                { status: 400 },
              );
            }
            data = { assigneeId: candidate };
          }
        } else {
          return NextResponse.json(
            { error: 'Assignataire invalide (identifiant ou null attendu).' },
            { status: 400 },
          );
        }
        break;
      }
    }

    await db.housekeepingTask.update({ where: { id: taskId }, data });

    // 'done' / 'reopen' propagent le statut de ménage sur le séjour lié
    // (une seule source de vérité : HousekeepingTask ⇄ Booking).
    if (existing.bookingId) {
      if (action === 'done') {
        await db.booking.updateMany({
          where: { id: existing.bookingId },
          data: { cleaningStatus: 'DONE' },
        });
      } else if (action === 'reopen') {
        await db.booking.updateMany({
          where: { id: existing.bookingId },
          data: { cleaningStatus: 'PENDING' },
        });
      }
    }

    // Réponse avec la même forme que le GET (booking + assignee inclus).
    const fresh = await db.housekeepingTask.findUnique({
      where: { id: taskId },
      include: taskInclude,
    });
    if (!fresh) {
      return NextResponse.json({ error: 'Intervention introuvable.' }, { status: 404 });
    }
    return NextResponse.json({ task: serializeTask(fresh, scope.names) });
  } catch (error) {
    console.error('[airbnb/menage/tasks PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
