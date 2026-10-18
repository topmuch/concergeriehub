import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';

// =============================================================
// v4.54 « PRESSING & BLANCHISSERIE EXPRESS » (amélioration 1.5)
// /api/airbnb/properties/[id]/laundry-orders
//
// GET   → les 50 dernières commandes pressing du bien (avec statut).
// PATCH → { orderId, action } :
//   'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCEL'
//         → transition de cycle de vie (hôte / pressing partenaire).
//   'MARK_PAID' → règlement hors plateforme (espèces/virement) :
//         status PAID + paidAt (comptable du Journal de Séjour).
//
// Sécurité : session NextAuth OWNER/MANAGER (canManageTeam) —
// identique aux autres routes property-scoped (minibar-ops…).
// =============================================================

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  orderId: z.string().trim().min(5).max(60),
  action: z.enum(['IN_PROGRESS', 'READY', 'DELIVERED', 'CANCEL', 'MARK_PAID']),
});

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

    const orders = await db.laundryOrder.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        bookingId: o.bookingId,
        guestName: o.guestName,
        serviceType: o.serviceType,
        pieces: o.pieces,
        pickupSlot: o.pickupSlot,
        notes: o.notes,
        amountEur: o.amountEur,
        payment: o.payment,
        status: o.status,
        paidAt: o.paidAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[airbnb/properties/[id]/laundry-orders GET] Error:', error);
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

    const { id: propertyId } = await ctx.params;
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide' },
        { status: 400 },
      );
    }
    const { orderId, action } = parsed.data;

    // Idempotence : updateMany scoping le bien (anti IDOR inter-bien).
    const data =
      action === 'MARK_PAID'
        ? { status: 'PAID', paidAt: new Date() }
        : action === 'CANCEL'
          ? { status: 'CANCELLED' }
          : { status: action };
    const updated = await db.laundryOrder.updateMany({
      where: { id: orderId, propertyId },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/properties/[id]/laundry-orders PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
