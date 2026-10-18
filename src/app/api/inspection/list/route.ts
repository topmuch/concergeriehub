// =============================================================
// /api/inspection/list — MODULE STANDALONE « ÉTAT DES LIEUX »
// (v4.107 — offre 299 €/an payée PayPal depuis la page d'accueil)
//
// GET : liste des inspections de l'utilisateur connecté (session
// obligatoire) + statut de son abonnement au module.
//
// v4.107 — ENTITLEMENT : l'abonnement n'est créé à la volée QUE pour
// les comptes Hub (superadmin / propriétaire / équipe). Un compte
// sans bien ni équipe et sans abonnement payé reçoit 403
// { error:'abonnement_requis', redirect:'/edl/abonnement' }.
// Un abonnement EXPIRÉ ne renvoie pas 403 : le statut est transmis
// tel quel pour que le dashboard affiche la bannière de renouvellement
// (les documents existants restent consultables).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveOrigin } from '@/lib/site';
import { inspectionShareUrl } from '@/lib/inspection-template';
import { isHubAccount } from '@/lib/edl-billing';

/** Garde de session — renvoie l'userId ou null. */
function requireUserId(session: { user?: unknown } | null): string | null {
  const id = (session?.user as { id?: string } | undefined)?.id;
  return session?.user && id ? id : null;
}

/**
 * v4.107 — Abonnement lu tel quel ; création à la volée UNIQUEMENT
 * pour les comptes Hub. null → ni abonnement ni compte Hub (achat requis).
 */
async function ensureSubscription(
  userId: string,
  role: string | null | undefined,
) {
  const now = new Date();
  const sub = await db.inspectionSubscription.findUnique({ where: { userId } });
  if (sub) return sub;
  if (!(await isHubAccount(userId, role))) return null;
  return db.inspectionSubscription.create({
    data: {
      userId,
      status: 'active',
      plan: 'edl_annual',
      endDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = requireUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const role = (session?.user as { role?: string } | undefined)?.role ?? null;

    const subscription = await ensureSubscription(userId, role);
    if (!subscription) {
      return NextResponse.json(
        {
          error: 'abonnement_requis',
          message: "L'offre États des Lieux (299 €/an, PDF illimités) est requise.",
          redirect: '/edl/abonnement',
        },
        { status: 403 },
      );
    }

    // 200 dernières inspections, plus récentes d'abord. Le comptage
    // des photos est calculé en base (count filtré par pièce).
    const inspections = await db.inspection.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        rooms: {
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { items: { where: { photoUrl: { not: null } } } } } },
        },
      },
    });

    return NextResponse.json({
      subscription: {
        status: subscription.status,
        plan: subscription.plan,
        endDate: subscription.endDate.toISOString(),
      },
      inspections: inspections.map((i) => ({
        id: i.id,
        propertyName: i.propertyName,
        propertyAddress: i.propertyAddress,
        ownerName: i.ownerName,
        guestName: i.guestName,
        guestEmail: i.guestEmail,
        guestPhone: i.guestPhone,
        type: i.type,
        scheduledDate: i.scheduledDate.toISOString(),
        status: i.status,
        publicToken: i.publicToken,
        cleanlinessScore: i.cleanlinessScore,
        sha256Hash: i.sha256Hash,
        shareUrl: inspectionShareUrl(i.publicToken, resolveOrigin(req)),
        photoCount: i.rooms.reduce((sum, room) => sum + room._count.items, 0),
        completedAt: i.completedAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
        linkedInspectionId: i.linkedInspectionId,
      })),
    });
  } catch (error) {
    console.error('[inspection/list GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
