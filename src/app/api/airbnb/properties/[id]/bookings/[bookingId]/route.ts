// =============================================================
// /api/airbnb/properties/[id]/bookings/[bookingId] — ÉTAPE 12 V2
//
// PATCH : OWNER/MANAGER → statut, dates, voyageur, notes.
//         CLEANER → uniquement cleaningStatus
//         ('PENDING' | 'IN_PROGRESS' | 'DONE').
//         MAINTENANCE → refusé.
// DELETE : OWNER/MANAGER uniquement.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';

type Ctx = { params: Promise<{ id: string; bookingId: string }> };

const CLEANING_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE'];
const BOOKING_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId, bookingId } = await ctx.params;
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
      guests?: number;
      notes?: string;
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
        select: { id: true, cleaningStatus: true },
      });
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
      if (!BOOKING_STATUSES.includes(body.status)) {
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
    if (body.guests !== undefined) {
      data.guests = Math.min(30, Math.max(1, Number(body.guests) || 2));
    }
    if (body.notes !== undefined) {
      data.notes = body.notes.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 });
    }

    const updated = await db.booking.update({
      where: { id: booking.id },
      data,
      select: { id: true, status: true, cleaningStatus: true, guestName: true, guests: true },
    });

    return NextResponse.json({ booking: updated });
  } catch (error) {
    console.error('[airbnb/properties/[id]/bookings/[bookingId] PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId, bookingId } = await ctx.params;
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
    console.error('[airbnb/properties/[id]/bookings/[bookingId] DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
