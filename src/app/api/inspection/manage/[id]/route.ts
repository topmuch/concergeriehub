// =============================================================
// /api/inspection/manage/[id] — MODULE STANDALONE « ÉTAT DES LIEUX »
// (v4.107 — 299 €/an, INDÉPENDANT du Hub)
//
// DELETE : supprime définitivement l'inspection (cascade pièces +
// équipements). Possibilité vérifiée via l'abonnement du compte.
// PATCH  : reprogrammation / correction des infos invité et du
// logement — UNIQUEMENT tant que l'invité n'a pas signé
// (status !== 'COMPLETED').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Garde de session — renvoie l'userId ou null. */
function requireUserId(session: { user?: unknown } | null): string | null {
  const id = (session?.user as { id?: string } | undefined)?.id;
  return session?.user && id ? id : null;
}

/**
 * Charge l'inspection et vérifie la possession via l'abonnement :
 *  • 404 si l'inspection n'existe pas ;
 *  • null si elle appartient à un autre abonnement (403 côté appelant).
 */
async function findOwnedInspection(userId: string, id: string) {
  const inspection = await db.inspection.findUnique({
    where: { id },
    select: { id: true, subscription: { select: { userId: true } } },
  });
  if (!inspection) return 'NOT_FOUND';
  if (inspection.subscription.userId !== userId) return 'FORBIDDEN';
  return inspection;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = requireUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id } = await params;
    const found = await findOwnedInspection(userId, id);
    if (found === 'NOT_FOUND') {
      return NextResponse.json({ error: 'État des lieux introuvable.' }, { status: 404 });
    }
    if (found === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Cascade Prisma : les pièces (InspectionRoom) et leurs items
    // (InspectionItem) sont supprimés automatiquement (onDelete: Cascade).
    await db.inspection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[inspection/manage DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = requireUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id } = await params;
    const found = await findOwnedInspection(userId, id);
    if (found === 'NOT_FOUND') {
      return NextResponse.json({ error: 'État des lieux introuvable.' }, { status: 404 });
    }
    if (found === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const current = await db.inspection.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (current.status === 'COMPLETED') {
      return NextResponse.json(
        { error: "État des lieux déjà signé par l'invité." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    // Champs éditables — seuls les champs présents sont modifiés.
    const data: {
      propertyName?: string;
      propertyAddress?: string;
      ownerName?: string;
      guestName?: string;
      guestEmail?: string | null;
      guestPhone?: string | null;
      scheduledDate?: Date;
    } = {};

    if (body.propertyName !== undefined) {
      const v = String(body.propertyName).trim();
      if (v.length < 1 || v.length > 160) {
        return NextResponse.json(
          { error: 'Le nom du logement est requis (160 caractères maximum).' },
          { status: 400 },
        );
      }
      data.propertyName = v;
    }
    if (body.propertyAddress !== undefined) {
      const v = String(body.propertyAddress).trim();
      if (v.length < 1 || v.length > 300) {
        return NextResponse.json(
          { error: "L'adresse du logement est requise (300 caractères maximum)." },
          { status: 400 },
        );
      }
      data.propertyAddress = v;
    }
    if (body.ownerName !== undefined) {
      const v = String(body.ownerName).trim();
      if (v.length < 1 || v.length > 120) {
        return NextResponse.json(
          { error: 'Le nom du propriétaire est requis (120 caractères maximum).' },
          { status: 400 },
        );
      }
      data.ownerName = v;
    }
    if (body.guestName !== undefined) {
      const v = String(body.guestName).trim();
      if (v.length < 1 || v.length > 120) {
        return NextResponse.json(
          { error: "Le nom de l'invité est requis (120 caractères maximum)." },
          { status: 400 },
        );
      }
      data.guestName = v;
    }
    if (body.guestEmail !== undefined) {
      const v = String(body.guestEmail ?? '').trim();
      if (v && !EMAIL_RE.test(v)) {
        return NextResponse.json({ error: 'Adresse email de l’invité invalide.' }, { status: 400 });
      }
      data.guestEmail = v || null;
    }
    if (body.guestPhone !== undefined) {
      const v = String(body.guestPhone ?? '').trim();
      data.guestPhone = v || null;
    }
    if (body.scheduledDate !== undefined) {
      const d = new Date(String(body.scheduledDate));
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: 'La date visée est invalide (format de date requis).' },
          { status: 400 },
        );
      }
      data.scheduledDate = d;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 });
    }

    const updated = await db.inspection.update({ where: { id }, data });

    return NextResponse.json({
      inspection: {
        id: updated.id,
        propertyName: updated.propertyName,
        propertyAddress: updated.propertyAddress,
        ownerName: updated.ownerName,
        guestName: updated.guestName,
        guestEmail: updated.guestEmail,
        guestPhone: updated.guestPhone,
        type: updated.type,
        scheduledDate: updated.scheduledDate.toISOString(),
        status: updated.status,
        publicToken: updated.publicToken,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[inspection/manage PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
