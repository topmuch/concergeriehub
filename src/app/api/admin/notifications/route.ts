// =============================================================
// /api/admin/notifications — Cloche de notifications du header
// Agrège les alertes RÉELLES de la plateforme :
//  - emails transactionnels en échec (EmailOutbox FAILED)
//  - commandes non payées > 48 h (ServiceOrder UNPAID)
//  - abonnements en impayé (Subscription past_due)
//  - plaques déclarées perdues (PhysicalQrCode lost)
// 🔒 Superadmin.
// =============================================================
import { NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const now = new Date();
    const since48h = new Date(now.getTime() - 48 * 3600 * 1000);

    const [failedEmails, staleUnpaidOrders, pastDueSubs, lostPlaques] = await Promise.all([
      db.emailOutbox.findMany({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, to: true, subject: true, createdAt: true, attempts: true },
      }),
      db.serviceOrder.findMany({
        where: { paymentStatus: 'UNPAID', createdAt: { lt: since48h } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, guestName: true, totalAmount: true, createdAt: true },
      }),
      db.subscription.findMany({
        where: { status: 'past_due' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, plan: true, userId: true, subscriberId: true },
      }),
      db.physicalQrCode.findMany({
        where: { status: 'lost' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, activationCode: true, status: true },
      }),
    ]);

    const items = [
      ...failedEmails.map((e) => ({
        kind: 'email_failed' as const,
        emoji: '📧',
        title: `Email en échec → ${e.to}`,
        detail: `${e.subject} (${e.attempts} tentative${e.attempts > 1 ? 's' : ''})`,
        href: '/admin/emails',
        at: e.createdAt.toISOString(),
      })),
      ...staleUnpaidOrders.map((o) => ({
        kind: 'order_unpaid' as const,
        emoji: '💳',
        title: `Commande impayée > 48 h — ${o.guestName}`,
        detail: `${o.totalAmount.toFixed(2)} € — à relancer`,
        href: '/admin/transactions',
        at: o.createdAt.toISOString(),
      })),
      ...pastDueSubs.map((s) => ({
        kind: 'sub_past_due' as const,
        emoji: '⚠️',
        title: `Abonnement en impayé (${s.plan})`,
        detail: s.userId ? 'Abonnement hôte à recouvrer' : 'Abonnement marchand/prestataire',
        href: '/admin/subscriptions',
        at: now.toISOString(),
      })),
      ...lostPlaques.map((p) => ({
        kind: 'plaque_lost' as const,
        emoji: '🔎',
        title: `Plaque déclarée perdue — ${p.activationCode}`,
        detail: 'Vérifier l\u2019inventaire plaques',
        href: '/admin/qr?tab=plaques',
        at: now.toISOString(),
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    return NextResponse.json({ count: items.length, items });
  } catch (error) {
    console.error('[GET /api/admin/notifications] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
