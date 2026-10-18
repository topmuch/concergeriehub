// =============================================================
// PATCH /api/airbnb/insights/[id] — COACH ROOMSCAN (v5.4)
// Action de l'hôte sur un insight :
//   action: 'RESOLVED'  → traité (isResolved + resolvedAt)
//           'DISMISSED' → ignoré (isResolved aussi — sort de la file)
//           'SNOOZED'   → reporté 24 h (reste non résolu, masqué)
//           'CLICKED'   → simple suivi d'engagement (bouton d'action)
// Chaque action est journalisée (InsightAction) et alimente les
// CoachAnalytics mensuelles du bien (résolus / ignorés / adoption).
// Sécurité : l'insight doit appartenir à un bien de l'utilisateur.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';

type Ctx = { params: Promise<{ id: string }> };
const VALID_ACTIONS = ['RESOLVED', 'DISMISSED', 'SNOOZED', 'CLICKED'] as const;
type ValidAction = (typeof VALID_ACTIONS)[number];

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action as ValidAction | undefined;
    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `action requis parmi ${VALID_ACTIONS.join(', ')}` },
        { status: 400 },
      );
    }

    const insight = await db.dashboardInsight.findUnique({ where: { id } });
    if (!insight) {
      return NextResponse.json({ error: 'Insight non trouvé' }, { status: 404 });
    }

    // Accès : le bien doit appartenir à l'utilisateur (owner ou membre).
    const myProperties = await resolveUserProperties(userId);
    if (!myProperties.some((p) => p.id === insight.propertyId)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const now = new Date();
    if (action === 'RESOLVED' || action === 'DISMISSED') {
      await db.dashboardInsight.update({
        where: { id },
        data: { isResolved: true, resolvedAt: now },
      });
    } else if (action === 'SNOOZED') {
      await db.dashboardInsight.update({
        where: { id },
        data: { expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      });
    }
    // CLICKED : aucun changement d'état — suivi d'engagement uniquement.

    await db.insightAction.create({
      data: { insightId: id, userId, actionType: action },
    });

    // Analytics mensuelles du bien (best effort).
    if (action === 'RESOLVED' || action === 'DISMISSED') {
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      try {
        const updated = await db.coachAnalytics.upsert({
          where: {
            propertyId_month_year: {
              propertyId: insight.propertyId,
              month,
              year,
            },
          },
          update:
            action === 'RESOLVED'
              ? { insightsResolved: { increment: 1 } }
              : { insightsDismissed: { increment: 1 } },
          create: {
            propertyId: insight.propertyId,
            month,
            year,
            insightsResolved: action === 'RESOLVED' ? 1 : 0,
            insightsDismissed: action === 'DISMISSED' ? 1 : 0,
          },
        });
        const total = updated.insightsResolved + updated.insightsDismissed;
        if (total > 0) {
          await db.coachAnalytics.update({
            where: { id: updated.id },
            data: { adoptionRate: updated.insightsResolved / total },
          });
        }
      } catch (error) {
        console.error('[airbnb/insights/id] analytics :', error);
      }
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error('[airbnb/insights/id PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
