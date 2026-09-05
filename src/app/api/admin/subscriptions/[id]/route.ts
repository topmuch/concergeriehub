// =============================================================
// /api/admin/subscriptions/[id] — Module 4 : actions abonnement
//
// PATCH ?action=cancel   → status 'cancelled' (fin de période non
//                          forcée : arrêt administratif immédiat)
// PATCH ?action=reactivate → status 'active'
// PATCH ?action=mark-paid  → status 'active' (régularisation impayé)
//
// Chaque action est journalisée (audit). Sans clé Stripe, les
// changements restent locaux (source de vérité = base + webhook
// Stripe mettra à jour à la prochaine synchronisation).
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';

const ACTIONS = {
  cancel: { status: 'cancelled' },
  reactivate: { status: 'active' },
  'mark-paid': { status: 'active' },
} as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const action = req.nextUrl.searchParams.get('action');
    const mapping = action ? (ACTIONS as Record<string, { status: string }>)[action] : undefined;
    if (!mapping) {
      return NextResponse.json(
        { error: 'Action inconnue (cancel | reactivate | mark-paid)' },
        { status: 400 },
      );
    }

    const sub = await db.subscription.findUnique({
      where: { id },
      select: { id: true, plan: true, status: true, userId: true, subscriberId: true },
    });
    if (!sub) {
      return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 });
    }

    await db.subscription.update({ where: { id }, data: { status: mapping.status } });
    await logAudit({
      actor: admin,
      action: `subscription.${action.replace('-', '_')}`,
      entityType: 'subscription',
      entityId: id,
      details: { plan: sub.plan, from: sub.status, to: mapping.status },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message: `Abonnement ${action === 'cancel' ? 'annulé' : 'réactivé'}` });
  } catch (error) {
    console.error('[PATCH /api/admin/subscriptions/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
