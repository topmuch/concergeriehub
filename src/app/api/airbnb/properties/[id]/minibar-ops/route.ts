import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';

// =============================================================
// v4.50 « MINIBAR DE CONFIANCE » — suivi côté HÔTE
// /api/airbnb/properties/[id]/minibar-ops
//
// GET  → les 3 listes du minibar du bien :
//   • orders   : commandes persistées (produits, total, paiement
//                'now' | 'departure' | 'onsite' | 'free', statut) ;
//   • checks   : validations d'inventaire d'arrivée (1 clic invité) ;
//   • restocks : demandes « Recharger le frigo » (PENDING/DONE).
//
// PATCH body { restockId, action: 'MARK_DONE' }
//   → l'hôte marque la demande de réapprovisionnement « traitée »
//     (l'équipe d'entretien a rechargé le minibar).
// PATCH body { orderId, action: 'MARK_PAID' }
//   → l'hôte encaisse une commande « à régler sur place / au départ ».
//
// Sécurité : session OWNER/MANAGER (canManageTeam) ; anti-abus 30/min.
// =============================================================

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId } = await ctx.params;
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const [orders, checks, restocks] = await Promise.all([
      db.minibarOrder.findMany({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          id: true,
          guestName: true,
          itemsJson: true,
          totalEur: true,
          payment: true,
          status: true,
          createdAt: true,
          bookingId: true,
        },
      }),
      db.minibarCheck.findMany({
        where: { propertyId },
        orderBy: { checkedAt: 'desc' },
        take: 30,
        select: { id: true, guestName: true, checkedAt: true, bookingId: true },
      }),
      db.minibarRestockRequest.findMany({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          guestName: true,
          status: true,
          createdAt: true,
          handledAt: true,
          bookingId: true,
        },
      }),
    ]);

    return NextResponse.json({
      orders: orders.map((o) => ({
        ...o,
        items: (() => {
          try {
            const parsed: unknown = JSON.parse(o.itemsJson);
            return Array.isArray(parsed)
              ? parsed
                  .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
                  .map((l) => ({
                    name: String(l.name ?? ''),
                    emoji: String(l.emoji ?? '🍷'),
                    qty: Number(l.qty ?? 0),
                    lineTotal: Number(l.lineTotal ?? 0),
                    free: l.free === true,
                  }))
              : [];
          } catch {
            return [];
          }
        })(),
      })),
      checks: checks.map((c) => ({ ...c, checkedAt: c.checkedAt.toISOString() })),
      restocks: restocks.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        handledAt: r.handledAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[airbnb/properties/[id]/minibar-ops GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { id: propertyId } = await ctx.params;
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const body = (await req.json()) as {
      restockId?: string;
      orderId?: string;
      action?: string;
    };

    if (body.action === 'MARK_DONE' && body.restockId) {
      const target = await db.minibarRestockRequest.findFirst({
        where: { id: body.restockId, propertyId },
        select: { id: true },
      });
      if (!target) {
        return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
      }
      await db.minibarRestockRequest.update({
        where: { id: target.id },
        data: { status: 'DONE', handledAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'MARK_PAID' && body.orderId) {
      const target = await db.minibarOrder.findFirst({
        where: { id: body.orderId, propertyId },
        select: { id: true },
      });
      if (!target) {
        return NextResponse.json({ error: 'Commande introuvable.' }, { status: 404 });
      }
      await db.minibarOrder.update({
        where: { id: target.id },
        data: { status: 'PAID' },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (error) {
    console.error('[airbnb/properties/[id]/minibar-ops PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
