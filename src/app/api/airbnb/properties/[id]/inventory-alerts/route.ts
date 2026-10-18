import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { inventoryItemMeta } from '@/lib/inventory';

// =============================================================
// v4.54 « ALERTES STOCK » (amélioration 2.2)
// /api/airbnb/properties/[id]/inventory-alerts
//
// GET   → les 60 derniers signalements du bien (open d'abord).
// PATCH → { alertId, action: 'RESOLVE' } → resolvedAt (l'hôte a
//         réapprovisionné). Idempotent, scoping bien (anti IDOR).
//
// Sécurité : session NextAuth OWNER/MANAGER (canManageTeam).
// =============================================================

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  alertId: z.string().trim().min(5).max(60),
  action: z.enum(['RESOLVE']),
});

function itemMeta(item: string): { label: string; emoji: string } {
  return inventoryItemMeta(item);
}

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

    const alerts = await db.inventoryAlert.findMany({
      where: { propertyId },
      orderBy: [{ resolvedAt: 'asc' }, { createdAt: 'desc' }],
      take: 60,
    });

    return NextResponse.json({
      alerts: alerts.map((a) => ({
        id: a.id,
        bookingId: a.bookingId,
        item: a.item,
        itemLabel: itemMeta(a.item).label,
        itemEmoji: itemMeta(a.item).emoji,
        status: a.status,
        reportedBy: a.reportedBy,
        note: a.note,
        createdAt: a.createdAt.toISOString(),
        resolvedAt: a.resolvedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[airbnb/properties/[id]/inventory-alerts GET] Error:', error);
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
    const { alertId } = parsed.data;

    // Idempotent : une alerte déjà résolue reste résolue.
    const updated = await db.inventoryAlert.updateMany({
      where: { id: alertId, propertyId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: 'Alerte introuvable ou déjà résolue' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/properties/[id]/inventory-alerts PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
