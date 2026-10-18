import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { MIDDLE_STAY_STATUS_LABEL, type MiddleStayRequestHost } from '@/lib/memories';

// =============================================================
// v4.52 « MIDDLE-STAY CARE » — file de traitement côté HÔTE
// /api/airbnb/properties/[id]/middle-stay
//
// GET → toutes les demandes du bien (réassort / ménage), plus
//       récentes d'abord + compteurs par statut.
// PATCH body { requestId, action: 'START' | 'COMPLETE' | 'REOPEN',
//               assignedTo? } → suivi pending → in_progress →
//               completed (completedAt horodaté).
//
// Sécurité : session OWNER/MANAGER (canManageTeam). Anti-abus 60/min.
// =============================================================

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const { id: propertyId } = await ctx.params;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const requests = await db.middleStayRequest.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });

    const serialized: MiddleStayRequestHost[] = requests.map((r) => ({
      id: r.id,
      guestName: r.guestName,
      requestType: r.requestType,
      details: r.details,
      status: r.status,
      assignedTo: r.assignedTo,
      price: r.price,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      requests: serialized,
      counts: {
        pending: serialized.filter((r) => r.status === 'pending').length,
        inProgress: serialized.filter((r) => r.status === 'in_progress').length,
        completed: serialized.filter((r) => r.status === 'completed').length,
      },
    });
  } catch (error) {
    console.error('[airbnb/properties/[id]/middle-stay GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

const patchSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(['START', 'COMPLETE', 'REOPEN']),
  assignedTo: z.string().trim().max(80).optional().nullable(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const { id: propertyId } = await ctx.params;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }
    const { requestId, action, assignedTo } = parsed.data;

    const request = await db.middleStayRequest.findFirst({
      where: { id: requestId, propertyId },
      select: { id: true },
    });
    if (!request) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    if (action === 'START') {
      await db.middleStayRequest.update({
        where: { id: requestId },
        data: { status: 'in_progress', ...(assignedTo ? { assignedTo } : {}) },
      });
    } else if (action === 'COMPLETE') {
      await db.middleStayRequest.update({
        where: { id: requestId },
        data: { status: 'completed', completedAt: new Date(), ...(assignedTo ? { assignedTo } : {}) },
      });
    } else {
      await db.middleStayRequest.update({
        where: { id: requestId },
        data: { status: 'pending', completedAt: null },
      });
    }

    return NextResponse.json({
      ok: true,
      statusLabel: MIDDLE_STAY_STATUS_LABEL[
        action === 'START' ? 'in_progress' : action === 'COMPLETE' ? 'completed' : 'pending'
      ]?.label,
    });
  } catch (error) {
    console.error('[airbnb/properties/[id]/middle-stay PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
