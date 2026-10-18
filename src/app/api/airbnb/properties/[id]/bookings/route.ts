// =============================================================
// /api/airbnb/properties/[id]/bookings — ÉTAPE 12 V2 : planning
//
// GET                    : séjours du bien. OWNER/MANAGER/CLEANER
//                        (le CLEANER ne voit que le planning
//                        ménage) — MAINTENANCE : refusé.
//                        ?upcoming=1 → séjours à venir.
// POST                   : création manuelle — OWNER/MANAGER.
// PATCH ?bookingId=<id>  : OWNER/MANAGER → statut, voyageur, notes.
//                        CLEANER → uniquement cleaningStatus.
// DELETE ?bookingId=<id> : OWNER/MANAGER uniquement.
//
// ⚠️ Design note : bookingId passe par un QUERY PARAM (et non un
// segment dynamique) — robustesse sandbox (renommage de dossiers
// bracketés observé sur [memberId]).
// status      : 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED'
// cleaning    : 'PENDING' | 'IN_PROGRESS' | 'DONE'
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { runAutomationTrigger } from '@/lib/automations-server';
// v4.50 — génération automatique du code d'activation du hub par séjour.
import { generateUniqueAccessCode } from '@/lib/hub-access';
// v4.96 — chaque séjour créé génère son intervention de ménage planifiée.
import { ensureHousekeepingTasksForProperty } from '@/lib/housekeeping-tasks';

type Ctx = { params: Promise<{ id: string }> };

const BOOKING_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId } = await ctx.params;
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }
    // MAINTENANCE → uniquement les réclamations techniques, pas le planning
    if (myRole === 'MAINTENANCE') {
      return NextResponse.json(
        { error: 'Le rôle Maintenance accède uniquement aux réclamations techniques.' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const upcoming = searchParams.get('upcoming') === '1';
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 100)));

    const bookings = await db.booking.findMany({
      where: {
        propertyId,
        ...(upcoming ? { checkOut: { gte: new Date() }, status: { not: 'CANCELLED' } } : {}),
      },
      orderBy: { checkIn: 'asc' },
      take: limit,
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        checkIn: true,
        checkOut: true,
        guests: true,
        source: true,
        status: true,
        cleaningStatus: true,
        externalRef: true,
        notes: true,
        // v4.50 — code d'activation hub + prolongation de séjour.
        accessCode: true,
        lateCheckOutUntil: true,
      },
    });

    // v4.81 (AUDIT QA) — MINIMISATION DES DONNÉES (RGPD) : le CLEANER
    // n'a besoin que du planning ménage — pas des coordonnées invités
    // (email, téléphone) ni du code d'accès du hub ni des notes privées
    // de l'hôte. Le champ est masqué (pas supprimé) pour garder le
    // contrat de forme de la réponse.
    const canSeeFullPii = canManageTeam(myRole);
    const sanitized = canSeeFullPii
      ? bookings
      : bookings.map((b) => ({
          ...b,
          guestEmail: null,
          guestPhone: null,
          accessCode: null,
          notes: null,
        }));

    return NextResponse.json({
      bookings: sanitized.map((b) => ({
        ...b,
        checkIn: b.checkIn.toISOString(),
        checkOut: b.checkOut.toISOString(),
      })),
      myRole,
      canManage: canManageTeam(myRole),
    });
  } catch (error) {
    console.error('[airbnb/properties/[id]/bookings GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { id: propertyId } = await ctx.params;
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json(
        { error: "Seuls le propriétaire et les gestionnaires peuvent créer des séjours." },
        { status: 403 },
      );
    }

    const body = (await req.json()) as {
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      checkIn?: string;
      checkOut?: string;
      guests?: number;
      source?: string;
      status?: string;
      externalRef?: string;
      notes?: string;
    };

    const guestName = (body.guestName ?? '').trim();
    if (guestName.length < 2) {
      return NextResponse.json({ error: 'Le nom du voyageur est requis.' }, { status: 400 });
    }

    const checkIn = parseDate(body.checkIn);
    const checkOut = parseDate(body.checkOut);
    if (!checkIn || !checkOut) {
      return NextResponse.json({ error: 'Dates invalalides (format ISO attendu).' }, { status: 400 });
    }
    if (checkOut.getTime() <= checkIn.getTime()) {
      return NextResponse.json(
        { error: 'La date de départ doit être après la date d’arrivée.' },
        { status: 400 },
      );
    }

    const source = ['AIRBNB', 'BOOKING', 'MANUAL', 'ICAL'].includes(body.source ?? '')
      ? (body.source as string)
      : 'MANUAL';
    const status = BOOKING_STATUSES.includes(body.status ?? '')
      ? (body.status as string)
      : 'CONFIRMED';

    // PREMIUM V5 — téléphone invité (SMS Bouclier d'avis). Validation
    // tolérante (format international conseillé) — sendSms reste fail-closed
    // sur E.164 au moment de l'envoi.
    const guestPhoneRaw = (body.guestPhone ?? '').trim();
    if (guestPhoneRaw) {
      if (guestPhoneRaw.length > 20) {
        return NextResponse.json(
          { error: 'Numéro de téléphone trop long (20 caractères max).' },
          { status: 400 },
        );
      }
      if (!/^[+0-9][0-9 ().-]*$/.test(guestPhoneRaw)) {
        return NextResponse.json(
          { error: 'Numéro de téléphone invalide (format international conseillé : +33612345678).' },
          { status: 400 },
        );
      }
    }

    const booking = await db.booking.create({
      data: {
        propertyId,
        guestName,
        guestEmail: (body.guestEmail ?? '').trim() || null,
        guestPhone: guestPhoneRaw || null,
        checkIn,
        checkOut,
        guests: Math.min(30, Math.max(1, Number(body.guests) || 2)),
        source,
        status,
        externalRef: (body.externalRef ?? '').trim() || null,
        notes: (body.notes ?? '').trim() || null,
        // v4.50 « VERROUILLAGE DU HUB PAR CODE » — à chaque réservation
        // saisie dans le calendrier, le système associe un code PIN (4
        // caractères) unique : 4 derniers chiffres du téléphone → 4
        // derniers du code plateforme → aléatoire unique.
        accessCode: await generateUniqueAccessCode(propertyId, guestPhoneRaw, body.externalRef),
      },
    });

    // v4.96 — INTERVENTION DE MÉNAGE PLANIFIÉE : la création manuelle
    // d'un séjour génère (au besoin) la tâche de ménage au créneau
    // entre son check-out et le check-in suivant. Silencieux : jamais
    // bloquant pour la création du séjour.
    try {
      await ensureHousekeepingTasksForProperty(propertyId);
    } catch (error) {
      console.error('[bookings POST] Génération housekeeping task échouée:', error);
    }

    // ÉTAPE 13 : automatisations BOOKING_CREATED (équipe + ménage)
    await runAutomationTrigger(propertyId, 'BOOKING_CREATED', {
      kind: 'booking',
      booking,
    });

    return NextResponse.json(
      { booking: { ...booking, checkIn: booking.checkIn.toISOString(), checkOut: booking.checkOut.toISOString() } },
      { status: 201 },
    );
  } catch (error) {
    console.error('[airbnb/properties/[id]/bookings POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// =============================================================
// PATCH ?bookingId=<id> — OWNER/MANAGER : statut, voyageur, notes.
// CLEANER : uniquement cleaningStatus. MAINTENANCE : refusé.
// =============================================================
const CLEANING_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE'];
const BOOKING_STATUSES_PATCH = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { id: propertyId } = await ctx.params;
    const bookingId = new URL(req.url).searchParams.get('bookingId');
    if (!bookingId) {
      return NextResponse.json({ error: 'Query param bookingId requis.' }, { status: 400 });
    }

    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, propertyId: true },
    });
    if (!booking || booking.propertyId !== propertyId) {
      return NextResponse.json({ error: 'Séjour introuvable.' }, { status: 404 });
    }

    const body = (await req.json()) as {
      cleaningStatus?: string;
      status?: string;
      guestName?: string;
      guestPhone?: string;
      guests?: number;
      notes?: string;
      // v4.50 — verrouillage du hub : code personnalisé + prolongation
      // de séjour (départ tardif validé par l'hôte → le verrouillage
      // ET le compte à rebours de l'invité se rallongent).
      accessCode?: string;
      lateCheckOutUntil?: string | null;
    };

    // ----- CLEANER : uniquement le statut de ménage -----
    if (myRole === 'CLEANER') {
      const cleaningStatus = body.cleaningStatus;
      if (!cleaningStatus || !CLEANING_STATUSES.includes(cleaningStatus)) {
        return NextResponse.json(
          { error: 'Le personnel de ménage peut uniquement mettre à jour le statut de ménage.' },
          { status: 403 },
        );
      }
      const updated = await db.booking.update({
        where: { id: booking.id },
        data: { cleaningStatus },
        select: { id: true, cleaningStatus: true, guestName: true, checkIn: true, checkOut: true },
      });
      // ÉTAPE 13 : automatisation CLEANING_DONE (le ménage termine)
      if (cleaningStatus === 'DONE') {
        await runAutomationTrigger(propertyId, 'CLEANING_DONE', {
          kind: 'booking',
          booking: updated,
        });
      }
      return NextResponse.json({ booking: updated });
    }

    if (myRole === 'MAINTENANCE') {
      return NextResponse.json(
        { error: 'Le rôle Maintenance accède uniquement aux réclamations techniques.' },
        { status: 403 },
      );
    }

    if (!canManageTeam(myRole)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // ----- OWNER / MANAGER -----
    const data: Record<string, unknown> = {};
    if (body.cleaningStatus !== undefined) {
      if (!CLEANING_STATUSES.includes(body.cleaningStatus)) {
        return NextResponse.json({ error: 'Statut de ménage invalide.' }, { status: 400 });
      }
      data.cleaningStatus = body.cleaningStatus;
    }
    if (body.status !== undefined) {
      if (!BOOKING_STATUSES_PATCH.includes(body.status)) {
        return NextResponse.json({ error: 'Statut de séjour invalide.' }, { status: 400 });
      }
      data.status = body.status;
    }
    if (body.guestName !== undefined) {
      const guestName = body.guestName.trim();
      if (guestName.length < 2) {
        return NextResponse.json({ error: 'Nom du voyageur trop court.' }, { status: 400 });
      }
      data.guestName = guestName;
    }
    if (body.guestPhone !== undefined) {
      // PREMIUM V5 — téléphone invité éditable ('' → efface le champ).
      const guestPhone = body.guestPhone.trim();
      if (guestPhone) {
        if (guestPhone.length > 20) {
          return NextResponse.json(
            { error: 'Numéro de téléphone trop long (20 caractères max).' },
            { status: 400 },
          );
        }
        if (!/^[+0-9][0-9 ().-]*$/.test(guestPhone)) {
          return NextResponse.json(
            { error: 'Numéro de téléphone invalide (format international conseillé : +33612345678).' },
            { status: 400 },
          );
        }
      }
      data.guestPhone = guestPhone || null;
    }
    if (body.guests !== undefined) {
      data.guests = Math.min(30, Math.max(1, Number(body.guests) || 2));
    }
    if (body.notes !== undefined) {
      data.notes = body.notes.trim() || null;
    }
    // ── v4.50 — VERROUILLAGE DU HUB ──
    if (body.accessCode !== undefined) {
      const code = body.accessCode.trim().toUpperCase();
      if (code && !/^[A-Z0-9]{4,8}$/.test(code)) {
        return NextResponse.json(
          { error: 'Code d’accès invalide : 4 à 8 lettres ou chiffres.' },
          { status: 400 },
        );
      }
      if (code) {
        // Unicité parmi les séjours à venir / en cours du bien.
        const now = new Date();
        const clash = await db.booking.findFirst({
          where: {
            propertyId,
            accessCode: code,
            status: { notIn: ['CANCELLED'] },
            checkOut: { gte: now },
            id: { not: booking.id },
          },
          select: { id: true, guestName: true },
        });
        if (clash) {
          return NextResponse.json(
            { error: `Ce code est déjà utilisé pour le séjour de ${clash.guestName}.` },
            { status: 409 },
          );
        }
      }
      data.accessCode = code || null;
    }
    if (body.lateCheckOutUntil !== undefined) {
      if (body.lateCheckOutUntil === null || body.lateCheckOutUntil === '') {
        data.lateCheckOutUntil = null;
      } else {
        const d = new Date(body.lateCheckOutUntil);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: 'Date de prolongation invalide.' }, { status: 400 });
        }
        data.lateCheckOutUntil = d;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 });
    }

    const updated = await db.booking.update({
      where: { id: booking.id },
      data,
      select: {
        id: true,
        status: true,
        cleaningStatus: true,
        guestName: true,
        guests: true,
        checkIn: true,
        checkOut: true,
        accessCode: true,
        lateCheckOutUntil: true,
      },
    });

    // ÉTAPE 13 : automatisation CLEANING_DONE (clôture manuelle)
    if (data.cleaningStatus === 'DONE') {
      await runAutomationTrigger(propertyId, 'CLEANING_DONE', {
        kind: 'booking',
        booking: updated,
      });
    }

    return NextResponse.json({ booking: updated });
  } catch (error) {
    console.error('[airbnb/properties/[id]/bookings PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// =============================================================
// DELETE ?bookingId=<id> — OWNER/MANAGER uniquement
// =============================================================
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { id: propertyId } = await ctx.params;
    const bookingId = new URL(req.url).searchParams.get('bookingId');
    if (!bookingId) {
      return NextResponse.json({ error: 'Query param bookingId requis.' }, { status: 400 });
    }

    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json(
        { error: "Seuls le propriétaire et les gestionnaires peuvent supprimer un séjour." },
        { status: 403 },
      );
    }

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, propertyId: true },
    });
    if (!booking || booking.propertyId !== propertyId) {
      return NextResponse.json({ error: 'Séjour introuvable.' }, { status: 404 });
    }

    await db.booking.delete({ where: { id: booking.id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('[airbnb/properties/[id]/bookings DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
