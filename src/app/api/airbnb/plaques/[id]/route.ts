// =============================================================
// /api/airbnb/plaques/[id] — ÉTAPE 6 / H4 : une plaque QR
//
// GET   : détail d'une plaque (pour la fiche imprimable).
// PATCH : changement de statut.
//         Contrat Dashboard Client : { status: 'inactive' | 'active' }
//         (désactiver ↔ réactiver). 'cancelled' et 'lost' restent
//         acceptés pour l'ancienne page /airbnb/dashboard/plaques
//         (redirigée plus tard). Garde : une plaque 'lost' ne peut
//         JAMAIS être modifiée (remplacement via support).
//         Chaque changement écrit un ActivationLog.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessProperty } from '@/lib/b2b-server';

const VALID_STATUSES = ['active', 'inactive', 'cancelled', 'lost'] as const;
type PlaqueStatus = (typeof VALID_STATUSES)[number];

/** Action tracée dans ActivationLog selon le statut cible. */
function activationActionFor(status: PlaqueStatus): string {
  if (status === 'active') return 'activated';
  if (status === 'lost') return 'marked_lost';
  return 'deactivated'; // 'inactive' (nouveau contrat) et 'cancelled' (legacy)
}

const INCLUDE = {
  property: { select: { id: true, name: true } },
} as const;

/** La plaque appartient-elle à l'utilisateur (claim ou via un bien) ? */
async function ownsPlaque(
  userId: string,
  plaque: { claimedByUserId: string | null; propertyId: string | null }
): Promise<boolean> {
  if (plaque.claimedByUserId === userId) return true;
  if (plaque.propertyId && (await canAccessProperty(userId, plaque.propertyId))) return true;
  return false;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    const { id } = await params;

    const plaque = await db.physicalQrCode.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!plaque || !(await ownsPlaque(userId, plaque))) {
      return NextResponse.json({ error: 'Plaque introuvable' }, { status: 404 });
    }

    return NextResponse.json({
      plaque: {
        id: plaque.id,
        hubSlug: plaque.hubSlug,
        status: plaque.status,
        activationCode: plaque.activationCode,
        createdAt: plaque.createdAt.toISOString(),
        claimedAt: plaque.claimedAt?.toISOString() ?? null,
        property: plaque.property,
      },
    });
  } catch (error) {
    console.error('Plaque GET error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as { status?: string } | null;
    const status = body?.status;
    if (!status || !VALID_STATUSES.includes(status as PlaqueStatus)) {
      return NextResponse.json(
        { error: `Statut invalide (valeurs : ${VALID_STATUSES.join(', ')})` },
        { status: 400 }
      );
    }

    const plaque = await db.physicalQrCode.findUnique({
      where: { id },
      select: { id: true, status: true, claimedByUserId: true, propertyId: true },
    });
    if (!plaque || !(await ownsPlaque(userId, plaque))) {
      return NextResponse.json({ error: 'Plaque introuvable' }, { status: 404 });
    }
    // Garde : une plaque signalée perdue est figée (remplacement via support).
    if (plaque.status === 'lost') {
      return NextResponse.json(
        { error: 'Plaque signalée perdue : elle ne peut plus être modifiée. Contactez le support pour la remplacer.' },
        { status: 409 }
      );
    }

    const updated = await db.physicalQrCode.update({
      where: { id },
      data: { status },
      include: INCLUDE,
    });

    await db.activationLog.create({
      data: {
        physicalQrCodeId: id,
        userId,
        action: activationActionFor(status as PlaqueStatus),
      },
    });

    return NextResponse.json({
      plaque: {
        id: updated.id,
        hubSlug: updated.hubSlug,
        status: updated.status,
        activationCode: updated.activationCode,
        createdAt: updated.createdAt.toISOString(),
        claimedAt: updated.claimedAt?.toISOString() ?? null,
        property: updated.property,
      },
    });
  } catch (error) {
    console.error('Plaque PATCH error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
